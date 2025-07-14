// index.cjs — Zazil 2025: Grok 4 Primary with Timed Fallbacks, Async Twilio (July 2025)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const twilio = require('twilio');
const axios = require('axios');

const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const getMarketplaceDica = require('./helpers/marketplaceDica');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const ZAZIL_PROMPT = require('./zazilPrompt');

const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');

const db = admin.firestore();
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const app = express();

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen - 40).trim() + '\n...(resposta resumida)';
}

const isCancel = text =>
  /\bcancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?\b/.test(text) ||
  text.includes('cancelar zazil') || text.includes('cancelar plano') || text.includes('cancelar assinatura') ||
  text.includes('cancel my plan') || text.includes('cancel subscription');

const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);
app.get('/', (req, res) => res.send('✅ Zazil backend up'));

app.post('/twilio-whatsapp', loggerMw(db), (req, res) => {
  // Immediately acknowledge Twilio to avoid timeout
  res.type('text/xml').send('<Response/>');

  // Process async
  setImmediate(async () => {
    const incoming = (req.body.Body || '').trim();
    const waNumber = req.body.From;
    const incomingLower = incoming.toLowerCase();

    try {
      // Onboard if new
      const { wasNew } = await profileSvc.load(db, waNumber);
      if (wasNew) {
        const welcomeMsg = replyHelper.welcome(waNumber);
        await sendMessageWithLog(waNumber, welcomeMsg.content);
        return;
      }

      // Quota check
      const quota = await profileSvc.getQuotaStatus(db, waNumber);
      if (!quota.allowed) {
        const upgradeMsg = replyHelper.upgrade(waNumber);
        await sendMessageWithLog(waNumber, upgradeMsg.content);
        return;
      }

      // CANCEL
      if (isCancel(incomingLower)) {
        const cancelMsg = replyHelper.cancel(waNumber);
        await sendMessageWithLog(waNumber, cancelMsg.content);
        return;
      }

      // GREETING
      if (greetingRegex.test(incoming)) {
        const greetReply = replyHelper.greeting();
        await sendMessageWithLog(waNumber, greetReply);
        return;
      }

      // Load personalization
      let profileDoc, memorySummary = '', city = '';
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : '';

      // Detect intent
      let intent = 'none';
      let previousQuery = '';
      const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
      if (memoryContext) {
        const [lastQuery] = memoryContext.split(' | ').filter(q => q.includes('asked')).pop() || '';
        if (lastQuery) previousQuery = lastQuery.replace(/asked: /, '');
      }
      const intentRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 20,
        messages: [
          { role: 'system', content: 'Classifique a intenção como: "event", "current", "shopping", "feedback", "follow-up", ou "none".' },
          { role: 'user', content: incoming + (previousQuery ? ` (contexto anterior: ${previousQuery})` : '') }
        ]
      }, {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      intent = intentRes.data.choices?.[0]?.message?.content?.trim().split(':')[1] || 'none';

      // MAIN ANSWER: Grok 4 primary with timed fallback to Perplexity
      let mainAnswer = '';
      let usedModel = '';
      const cityForPrompt = city && city.length > 1 && city.toLowerCase() !== 'eua' ? city : (intent === 'event' && !city ? 'por favor, me diga sua cidade' : 'EUA');

      try {
        const xaiRes = await axios.post('https://api.x.ai/v1/chat/completions', {
          model: 'grok-4',
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: ZAZIL_PROMPT },
            { role: 'user', content: incoming + (cityForPrompt && !incoming.toLowerCase().includes(cityForPrompt.toLowerCase()) ? ` em ${cityForPrompt}` : '') }
          ]
        }, {
          headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
          timeout: 5000 // 5s timeout for Grok
        });
        mainAnswer = xaiRes.data.choices[0].message.content || '';
        usedModel = 'Grok 4';
      } catch (xaiErr) {
        console.error('[Grok] Error:', xaiErr.response?.data || xaiErr.message);
        const { answer: perplexityAnswer } = await perplexityService.search(incoming, cityForPrompt);
        mainAnswer = perplexityAnswer || '';
        usedModel = 'Perplexity (fallback)';
      }

      // Handle follow-ups or incomplete questions
      if (intent === 'follow-up' && previousQuery) {
        mainAnswer = `${mainAnswer} (continuação de: ${previousQuery})`;
      }

      // Marketplace Dica (Brazilian Layer)
      let marketplaceDica = '';
      try {
        marketplaceDica = await getMarketplaceDica({
          message: incoming,
          city,
          context: memorySummary,
        });
        if (marketplaceDica && typeof marketplaceDica !== 'string') {
          marketplaceDica = String(marketplaceDica);
        }
      } catch (e) {
        console.error('[Marketplace Dica] Error:', e);
        marketplaceDica = '';
      }

      let dicasBlock = '';
      if (marketplaceDica && marketplaceDica.trim().length > 3) {
        dicasBlock = `\n\n${marketplaceDica.trim()}`;
      } else {
        dicasBlock = '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
      }

      let fullContent = (mainAnswer || '').trim() + dicasBlock;

      // LOGS: For debugging (include intent)
      console.log('---- [DEBUG ZAZIL] ----');
      console.log('User:', waNumber);
      console.log('Q:', incoming);
      console.log('Intent:', intent);
      console.log('Main:', mainAnswer?.slice(0, 120));
      console.log('Dica:', dicasBlock?.slice(0, 120));
      console.log('Full (len):', fullContent.length);

      // Truncation logic: If too long, show truncated + full link
      let safeContent = '';
      let truncateId = null;
      if (fullContent.length <= 950) {
        safeContent = fullContent;
      } else {
        const short = truncateForWhatsapp(fullContent, 850);
        const docRef = await db.collection('longReplies').add({
          waNumber,
          question: incoming,
          answer: fullContent,
          createdAt: new Date()
        });
        truncateId = docRef.id;
        safeContent = `${short}\n\n👉 Leia a resposta completa: https://zazl-backend.onrender.com/view/${truncateId}`;
      }

      // Postprocess with hallucination check
      let replyObj = replyHelper.generic(safeContent);
      replyObj = await postprocess(replyObj, incoming);

      // Memory update
      await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);
      try {
        const profileDoc = db.collection('profiles').doc(waNumber);
        const old = memorySummary || '';
        memorySvc.updateUserSummary(waNumber, old, incoming)
          .then(summary => {
            if (summary && summary !== old) {
              profileDoc.set({ memory: summary }, { merge: true });
            }
          })
          .catch(err => { console.error('[MEMORY] Error in updateUserSummary:', err); });
      } catch (e) { console.error('[MEMORY] Outer error:', e); }

      // Final check: too short, broken, fallback
      if (
        !safeContent ||
        safeContent.length < 80 ||
        /^1\.\s*$/.test(safeContent.trim()) ||
        safeContent.startsWith('Dica do Zazil')
      ) {
        safeContent = replyHelper.fallback().content;
      }

      console.log(`[index.cjs] Outgoing reply length: ${safeContent.length} | Used model: ${usedModel}`);
      // Send message with Twilio SDK
      const message = await twilioClient.messages.create({
        body: safeContent,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });
      console.log(`[Twilio] Message SID: ${message.sid} | Status: ${message.status}`);

      // Optional: Log to Firestore for delivery tracking
      await db.collection('messageLogs').add({
        waNumber,
        sid: message.sid,
        status: message.status,
        timestamp: new Date(),
        content: safeContent.slice(0, 500) // Truncate for storage
      });

      // Check delivery status after 5s (optional enhancement)
      setTimeout(async () => {
        const status = await twilioClient.messages(message.sid).fetch();
        if (status.status === 'failed' || status.status === 'undelivered') {
          console.error(`[Twilio] Delivery failed for SID: ${message.sid}, error: ${status.errorMessage}`);
          await db.collection('deliveryErrors').add({
            waNumber,
            sid: message.sid,
            error: status.errorMessage,
            timestamp: new Date()
          });
        }
      }, 5000);

    } catch (asyncErr) {
      console.error('[Async Processing] Error:', asyncErr);
      await sendMessageWithLog(waNumber, replyHelper.fallback().content);
    }
  });
});

function sendMessageWithLog(waNumber, content) {
  return twilioClient.messages.create({
    body: content,
    from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
    to: waNumber
  }).then(message => {
    console.log(`[Twilio] Message SID: ${message.sid} | Status: ${message.status}`);
    return db.collection('messageLogs').add({
      waNumber,
      sid: message.sid,
      status: message.status,
      timestamp: new Date(),
      content: content.slice(0, 500)
    });
  }).catch(err => {
    console.error('[Twilio Send Error]:', err);
    return Promise.reject(err);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));