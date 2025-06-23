// index.cjs — Zazil (Marketplace-Ready, Perplexity-First, WhatsApp-safe, City-intelligent)

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

const TRUNC_LINK = 'https://zazl-backend.onrender.com/view/';

// WhatsApp truncation helper — safe limit for messages (950 is conservative)
function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  // Try to keep main answer + first Dica (if present)
  const dicaSplit = msg.toLowerCase().indexOf('dica do zazil');
  if (dicaSplit > 0) {
    const mainShort = msg.slice(0, dicaSplit).split('.').slice(0, 2).join('.') + '.\n';
    const dica = msg.slice(dicaSplit, dicaSplit + 300); // Only first Dica, max 300 chars
    let output = mainShort + dica;
    if (output.length > maxLen) output = output.slice(0, maxLen - 20) + '\n...(resposta resumida)';
    return output;
  }
  return msg.slice(0, maxLen - 20) + '\n...(resposta resumida)';
}

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
    let profileDoc, memorySummary = '', city = '';
    try {
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : '';
    } catch (e) { city = ''; }

    // 6. Intent detection (GPT-4.1)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    // 7. MAIN ANSWER: Perplexity (always with city, fallback to EUA)
    let cityForPrompt = city && city.length > 1 && city.toLowerCase() !== 'eua' ? city : 'EUA';
    let mainAnswer = '';
    try {
      const { answer } = await perplexityService.search(incoming, cityForPrompt);
      mainAnswer = answer || '';
      if (!mainAnswer || mainAnswer.length < 3) {
        // Fallback: OpenAI/GPT-4.1 if Perplexity gives nothing
        const gpt = await openai.chat.completions.create({
          model: 'gpt-4.1',
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: ZAZIL_PROMPT },
            { role: 'user', content: incoming }
          ]
        });
        mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
      }
    } catch (err) {
      // Double fallback to OpenAI if even Perplexity fails
      const gpt = await openai.chat.completions.create({
        model: 'gpt-4.1',
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: ZAZIL_PROMPT },
          { role: 'user', content: incoming }
        ]
      });
      mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
    }

    // 8. "Dica do Zazil" — ADDITIVE Marketplace/Partner Layer
    let dicaSection = '';
    try {
      dicaSection = await dicaSvc.getDica({ intent, message: incoming, city, memory: memorySummary });
    } catch (e) {
      dicaSection = ''; // Never block main answer
    }

    // 9. Compose and truncate for WhatsApp safety
    const finalContent = [
      mainAnswer.trim(),
      dicaSection ? `\n\n💡 Dica do Zazil: ${dicaSection}` : ''
    ].join('').trim();

    let replyObj = replyHelper.generic(finalContent);

    // 10. Postprocess (cleans up, trust dica, etc)
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

    // 12. Fallback for empty replyObj; truncate long replies for WhatsApp!
    let safeContent = replyHelper.fallback().content;
    if (replyObj && typeof replyObj.content === 'string' && replyObj.content.trim()) {
      safeContent = truncateForWhatsapp(replyObj.content, 950);
    } else {
      console.warn('[Zazil] No replyObj or content found — using fallback.');
    }

    console.log('[index.cjs] Outgoing reply:', safeContent, '\nLength:', safeContent.length);

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