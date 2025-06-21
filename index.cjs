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
const dicaSvc = require('./helpers/dica');        // NEW! Marketplace engine
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

const TRUNC_LINK = 'https://zazl-backend.onrender.com/view/';

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
    // 1. Onboarding for new users
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    // 2. Plan limit check
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const upgradeMsg = replyHelper.upgrade(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    // 3. Robust CANCEL detection (before intent)
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

    // 4. Greeting detection
    const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;
    if (greetingRegex.test(incoming)) {
      const greetReply =
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, ou compras — ou peça uma dica!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // 5. Personalization: Load memory (city, context)
    let profileDoc, memorySummary = '', city = 'EUA';
    try {
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : 'EUA';
    } catch (e) { city = 'EUA'; }

    // 6. Intent detection (GPT-4.1)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    // 7. ALWAYS get "main answer" (Perplexity/GPT-4.1 as needed)
    let mainAnswer = '';
    if (['COPYWRITING', 'SERVICE_COST'].includes(intent)) {
      // Use GPT-4.1 for writing/service cost
      let userPrompt = incoming;
      if (memorySummary && memorySummary.trim().length > 0) {
        userPrompt = `[DADOS DO USUÁRIO ATÉ AGORA]:\n${memorySummary}\n\n[PERGUNTA]:\n${incoming}`;
      }
      const gpt = await openai.chat.completions.create({
        model: 'gpt-4.1',
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: ZAZIL_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      });
      mainAnswer = gpt.choices?.[0]?.message?.content || '';
    } else {
      // Use Perplexity for all else (news, events, products, immigration, etc)
      let prompt = incoming;
      if (city && city !== 'EUA' && !incoming.toLowerCase().includes(city.toLowerCase())) {
        prompt = `${incoming} em ${city}`;
      }
      const { answer } = await perplexityService.search(prompt);
      mainAnswer = answer || '';
    }

    // 8. "Dica do Zazil" — fetch partner offers based on context/intent/message/city
    const dicaSection = await dicaSvc.getDica({ intent, message: incoming, city });

    // 9. Compose the reply
    const finalContent = [
      mainAnswer.trim(),
      dicaSection ? `\n\n💡 *Dica do Zazil*: ${dicaSection}` : ''
    ].join('').trim();

    let replyObj = replyHelper.generic(finalContent);

    // 10. Postprocess if needed (same as before)
    replyObj = postprocess(replyObj, incoming, intent);

    // 11. Memory update (same as before)
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

    // 12. Standardized fallback
    let safeContent = replyHelper.fallback().content;
    if (replyObj && typeof replyObj.content === 'string' && replyObj.content.trim()) {
      safeContent = replyObj.content;
    } else {
      console.warn('[Zazil] No replyObj or content found — using fallback.');
    }

    res.type('text/xml');
    res.send(`<Response><Message>${safeContent}</Message></Response>`);
  } catch (err) {
    console.error('[twilio-whatsapp] error:', err);
    // OUTAGE FALLBACK for Firestore/Firebase/network error
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