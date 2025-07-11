// index.cjs — Zazil 2025: RAG Memory, Model-Driven, Reliable Events (July 2025)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const { OpenAI } = require('openai');

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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen - 40).trim() + '\n...(resposta resumida)';
}

// Handlers
const isCancel = text => /\bcancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?\b/i.test(text);
const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);
app.get('/', (req, res) => res.send('✅ Zazil backend up (July 2025)'));

app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  const incomingLower = incoming.toLowerCase();

  try {
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      return res.type('text/xml').send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const upgradeMsg = replyHelper.upgrade(waNumber);
      return res.type('text/xml').send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    if (isCancel(incomingLower)) {
      const cancelMsg = replyHelper.cancel(waNumber);
      return res.type('text/xml').send(`<Response><Message>${cancelMsg.content}</Message></Response>`);
    }

    if (greetingRegex.test(incoming)) {
      const greetReply = replyHelper.greeting();
      return res.type('text/xml').send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // Load with RAG memory
    const profileDoc = await db.collection('profiles').doc(waNumber).get();
    const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
    let city = profileDoc.data()?.city || '';

    const enhancedPrompt = ZAZIL_PROMPT + `\nContexto do usuário: ${memoryContext || 'Nenhum contexto salvo.'}`;

    // Model-driven intent for query type
    const intentRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 20,
      messages: [{ role: 'system', content: 'Classifique: CURRENT (news/events/now), AMAZON, EVENT, FX, SERVICE_COST, ou GENERIC.' },
                { role: 'user', content: incoming }]
    });
    const intent = intentRes.choices[0].message.content.trim();

    let mainAnswer = '';
    let usedModel = '';
    const cityForPrompt = city || 'EUA';

    if (intent === 'CURRENT') {
      const { answer } = await perplexityService.search(incoming, cityForPrompt);
      mainAnswer = answer || '';
      usedModel = 'Perplexity';
    }

    if (!mainAnswer || mainAnswer.length < 50) {
      const gpt = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: enhancedPrompt },
          { role: 'user', content: incoming + (cityForPrompt ? ` em ${cityForPrompt}` : '') }
        ]
      });
      mainAnswer = gpt.choices?.[0]?.message?.content || 'Desculpe, não consegui responder agora.';
      usedModel = 'GPT-4o';
    }

    // Single Dica
    const marketplaceDica = await getMarketplaceDica({ message: incoming, city: cityForPrompt, context: memoryContext, intent });

    let fullContent = mainAnswer.trim();
    if (marketplaceDica) fullContent += `\n\n${marketplaceDica.trim()}`;

    console.log('---- [DEBUG ZAZIL] ----');
    console.log('User:', waNumber);
    console.log('Q:', incoming);
    console.log('Memory:', memoryContext);
    console.log('Intent:', intent);
    console.log('Main:', mainAnswer.slice(0, 120));
    console.log('Dica:', marketplaceDica?.slice(0, 120) || 'None');
    console.log('Full Len:', fullContent.length);

    let safeContent = fullContent.length <= 950 ? fullContent : '';
    let truncateId = null;
    if (fullContent.length > 950) {
      const short = truncateForWhatsapp(fullContent);
      const docRef = await db.collection('longReplies').add({
        waNumber,
        question: incoming,
        answer: fullContent,
        createdAt: new Date()
      });
      truncateId = docRef.id;
      safeContent = `${short}\n\n👉 Leia completo: https://zazl-backend.onrender.com/view/${truncateId}`;
    }

    let replyObj = replyHelper.generic(safeContent);
    replyObj = postprocess(replyObj, incoming);

    await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);

    const oldSummary = profileDoc.data()?.memory || '';
    const newSummary = await memorySvc.updateUserSummary(waNumber, oldSummary, incoming);
    if (newSummary !== oldSummary) {
      await db.collection('profiles').doc(waNumber).set({ memory: newSummary }, { merge: true });
    }

    if (!safeContent || safeContent.length < 80) safeContent = replyHelper.fallback().content;

    console.log(`[index.cjs] Outgoing len: ${safeContent.length} | Model: ${usedModel}`);
    res.type('text/xml').send(`<Response><Message>${safeContent}</Message></Response>`);
  } catch (err) {
    console.error('[twilio-whatsapp] error:', err);
    res.type('text/xml').send(`<Response><Message>${replyHelper.fallback().content}</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT} (July 2025)`));