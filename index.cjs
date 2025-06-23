// index.cjs — Zazil v2 (Marketplace-Ready, Perplexity-First)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const dicaSvc = require('./helpers/dica');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const ZAZIL_PROMPT = require('./zazilPrompt');

const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');
const serviceCost = require('./helpers/service_cost');

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);

app.get('/', (req, res) => res.send('✅ Zazil backend up'));

app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  console.log('[twilio] got incoming:', JSON.stringify(incoming));

  try {
    // Onboarding for new users
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    // Plan limit check (also checks for expired trial!)
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      // Trial expired = specific message
      if (quota.plan === 'trial' && quota.trialExpired) {
        const expiredMsg = replyHelper.trialExpired(waNumber);
        res.type('text/xml');
        return res.send(`<Response><Message>${expiredMsg.content}</Message></Response>`);
      }
      const upgradeMsg = replyHelper.upgrade(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    // Robust CANCEL detection (before intent)
    const incomingLower = incoming.toLowerCase();
    if (
      /\bcancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?\b/.test(incomingLower) ||
      incomingLower.includes('cancelar zazil') ||
      incomingLower.includes('cancelar plano') ||
      incomingLower.includes('cancelar assinatura') ||
      incomingLower.includes('cancel my plan') ||
      incomingLower.includes('cancel subscription') ||
      incomingLower.includes('cancel zazil')
    ) {
      const cancelMsg = replyHelper.cancel(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${cancelMsg.content}</Message></Response>`);
    }

    // Greeting detection
    const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;
    if (greetingRegex.test(incoming)) {
      const greetReply =
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, ou compras — ou peça uma dica!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // Personalization: Load memory (city, context)
    let profileDoc, memorySummary = '', city = 'EUA';
    try {
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : 'EUA';
    } catch (e) { city = 'EUA'; }

    // Intent detection
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    // === GREAT PRODUCT LOGIC: ALWAYS GET MAIN ANSWER FIRST ===
    let mainAnswer = '';
    try {
      // Perplexity first (events always specify city, shopping specify "nos EUA")
      let prompt = incoming;
      if (intent === 'EVENT' && city && city !== 'EUA') {
        prompt = `Eventos brasileiros em ${city} nas próximas semanas`;
      }
      if (intent === 'AMAZON') {
        prompt = `${incoming} comprar nos EUA (Amazon, Walmart, BestBuy)`;
      }
      const { answer } = await perplexityService.search(prompt);
      mainAnswer = answer || '';
    } catch (e) {
      // Fallback: OpenAI
      try {
        const prompt = `Responda para um brasileiro nos EUA: ${incoming}`;
        const response = await openai.chat.completions.create({
          model: 'gpt-4.1',
          temperature: 0.4,
          max_tokens: 400,
          messages: [
            { role: 'system', content: 'Você é um assistente brasileiro especialista em vida prática nos EUA.' },
            { role: 'user', content: prompt }
          ]
        });
        mainAnswer = response.choices?.[0]?.message?.content?.trim() || '';
      } catch (err) {
        mainAnswer = '';
      }
    }

    // === ENRICH WITH DICA DO ZAZIL (Marketplace/Partner layer) ===
    const dicaSection = await dicaSvc.getDica({ intent, message: incoming, city });

    // Compose the reply: always mainAnswer first, dica is optional enrichment
    const finalContent = [
      mainAnswer.trim(),
      dicaSection ? `\n\n💡 *Dica do Zazil*: ${dicaSection}` : ''
    ].join('').trim();

    let replyObj = replyHelper.generic(finalContent);

    // Postprocess (clean citations, add "Dica do Zazil" if needed)
    replyObj = postprocess(replyObj, incoming, intent);

    // Memory update
    await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);
    if (['GENERIC', 'EVENT', 'AMAZON', 'NEWS'].includes(intent)) {
      try {
        const profileDoc = db.collection('profiles').doc(waNumber);
        const old = memorySummary || '';
        memorySvc
          .updateUserSummary(old, incoming)
          .then(summary => {
            if (summary && summary !== old) {
              profileDoc.set({ memory: summary }, { merge: true });
            }
          })
          .catch(err => { console.error('[MEMORY] Error in updateUserSummary:', err); });
      } catch (e) { console.error('[MEMORY] Outer error:', e); }
    }

    // Always respond
    let safeContent = replyHelper.fallback().content;
    if (replyObj && typeof replyObj.content === 'string' && replyObj.content.trim()) {
      safeContent = replyObj.content;
    }
    res.type('text/xml');
    res.send(`<Response><Message>${safeContent}</Message></Response>`);
  } catch (err) {
    console.error('[twilio-whatsapp] error:', err);
    if (
      (err.message && err.message.match(/firestore|firebase|unavailable|timeout|network/i)) ||
      (err.code && err.code.toString().includes('unavailable'))
    ) {
      res.type('text/xml');
      return res.send(`<Response><Message>${replyHelper.fallbackOutage().content}</Message></Response>`);
    }
    res.type('text/xml');
    res.send(`<Response><Message>${replyHelper.fallback().content}</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));