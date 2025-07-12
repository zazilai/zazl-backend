// index.cjs — Zazil 2025 MVP: Hybrid with Grok 4, Async for Twilio, Always AI Answer + Brazilian Layer (July 2025)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const { OpenAI } = require('openai');
const twilio = require('twilio'); // For async replies

const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const getMarketplaceDica = require('./helpers/marketplaceDica');
const perplexityService = require('./helpers/perplexity'); // Optional tertiary fallback
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const ZAZIL_PROMPT = require('./zazilPrompt');
const { getGrokResponse } = require('./helpers/grok'); // Grok integration

const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN); // For async sends
const app = express();

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  const cutoff = maxLen - 100;
  let slice = msg.slice(0, cutoff);
  const lastPeriod = slice.lastIndexOf('.');
  if (lastPeriod > cutoff / 2) slice = slice.slice(0, lastPeriod + 1);
  return slice.trim() + '\n...(resposta resumida)';
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
app.get('/', (req, res) => res.send('✅ Zazil backend up (July 2025)'));

app.post('/twilio-whatsapp', loggerMw(db), (req, res) => {
  // Immediately acknowledge to avoid Twilio timeout
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
        return await twilioClient.messages.create({
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          body: welcomeMsg.content,
          to: waNumber
        });
      }

      // Quota check
      const quota = await profileSvc.getQuotaStatus(db, waNumber);
      if (!quota.allowed) {
        const upgradeMsg = replyHelper.upgrade(waNumber);
        return await twilioClient.messages.create({
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          body: upgradeMsg.content,
          to: waNumber
        });
      }

      // CANCEL
      if (isCancel(incomingLower)) {
        const cancelMsg = replyHelper.cancel(waNumber);
        return await twilioClient.messages.create({
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          body: cancelMsg.content,
          to: waNumber
        });
      }

      // GREETING
      if (greetingRegex.test(incoming)) {
        const greetReply = replyHelper.greeting();
        return await twilioClient.messages.create({
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          body: greetReply,
          to: waNumber
        });
      }

      // Load personalization
      let profileDoc, memorySummary = '', city = '';
      try {
        profileDoc = await db.collection('profiles').doc(waNumber).get();
        memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
        city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : '';
      } catch (e) { city = ''; }

      // Model-driven intent
      const intentCheck = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 20,
        messages: [{ role: 'system', content: 'Classifique se a pergunta é sobre notícias/atualidades/eventos: Sim ou Não.' },
                  { role: 'user', content: incoming }]
      });
      const isCurrent = intentCheck.choices[0].message.content.trim().toLowerCase() === 'sim';

      // MAIN ANSWER: Hybrid with Grok
      let mainAnswer = '';
      let usedModel = '';
      const cityForPrompt = city && city.length > 1 && city.toLowerCase() !== 'eua' ? city : 'EUA';
      const messages = [
        { role: 'system', content: ZAZIL_PROMPT },
        { role: 'user', content: incoming + (cityForPrompt && !incoming.toLowerCase().includes(cityForPrompt.toLowerCase()) ? ` em ${cityForPrompt}` : '') }
      ];

      try {
        if (isCurrent) {
          mainAnswer = await getGrokResponse(messages) || '';
          usedModel = 'Grok 4';
        }

        if (!mainAnswer || mainAnswer.length < 30) {
          const gpt = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.3,
            max_tokens: 2048,
            messages
          });
          mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
          usedModel = 'GPT-4o (fallback)';
        }
      } catch (err) {
        console.error('[AI ERROR]', err);
        mainAnswer = "Desculpe, não consegui responder sua pergunta agora.";
      }

      // Marketplace Dica
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

      // Append Dica
      let dicasBlock = '';
      if (marketplaceDica && marketplaceDica.trim().length > 3) {
        dicasBlock = `\n\n${marketplaceDica.trim()}`;
      } else {
        dicasBlock = '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
      }

      // Compose full
      let fullContent = (mainAnswer || '').trim() + dicasBlock;

      // LOGS
      console.log('---- [DEBUG ZAZIL] ----');
      console.log('User:', waNumber);
      console.log('Q:', incoming);
      console.log('Main:', mainAnswer?.slice(0, 120));
      console.log('Dica:', dicasBlock?.slice(0, 120));
      console.log('Full (len):', fullContent.length);

      // Truncation
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

      // Postprocess
      let replyObj = replyHelper.generic(safeContent);
      replyObj = postprocess(replyObj, incoming);

      // Memory update
      await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);
      try {
        const profileDoc = db.collection('profiles').doc(waNumber);
        const old = memorySummary || '';
        memorySvc.updateUserSummary(old, incoming)
          .then(summary => {
            if (summary && summary !== old) {
              profileDoc.set({ memory: summary }, { merge: true });
            }
          })
          .catch(err => { console.error('[MEMORY] Error in updateUserSummary:', err); });
      } catch (e) { console.error('[MEMORY] Outer error:', e); }

      // Final check
      if (
        !safeContent ||
        safeContent.length < 80 ||
        /^1\.\s*$/.test(safeContent.trim()) ||
        safeContent.startsWith('Dica do Zazil')
      ) {
        safeContent = replyHelper.fallback().content;
      }

      console.log(`[index.cjs] Outgoing reply length: ${safeContent.length} | Used model: ${usedModel}`);

      // Send async reply
      await twilioClient.messages.create({
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        body: safeContent,
        to: waNumber
      });
    } catch (err) {
      console.error('[Async Processing] Error:', err);
      // Send fallback if processing fails
      await twilioClient.messages.create({
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        body: replyHelper.fallback().content,
        to: waNumber
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));