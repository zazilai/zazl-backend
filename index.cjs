// index.cjs — Zazil (Marketplace-Orchestrated, WhatsApp-safe, Smart, Great Product)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const getMarketplaceDica = require('./helpers/marketplaceDica'); // NEW
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

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  const dicaSplit = msg.toLowerCase().indexOf('dica do zazil');
  if (dicaSplit > 0) {
    const mainShort = msg.slice(0, dicaSplit).split('.').slice(0, 2).join('.') + '.\n';
    const dica = msg.slice(dicaSplit, dicaSplit + 300);
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
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const upgradeMsg = replyHelper.upgrade(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    // CANCEL
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

    // GREETING
    const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;
    if (greetingRegex.test(incoming)) {
      const greetReply =
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, ou compras — ou peça uma dica!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // Personalization: Load memory (city, context)
    let profileDoc, memorySummary = '', city = '';
    try {
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : '';
    } catch (e) { city = ''; }

    // Intent detection
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    // MAIN ANSWER LOGIC
    let mainAnswer = '';
    let usedModel = '';
    const cityForPrompt = city && city.length > 1 && city.toLowerCase() !== 'eua' ? city : 'EUA';

    try {
      // NEWS or GENERIC with "current event" keywords → Perplexity
      if (
        intent === 'NEWS' ||
        (
          intent === 'GENERIC' &&
          /\b(hoje|atualiza|notícia|noticias|aconteceu|agora|última hora|breaking|eventos?|agenda|programação|resultados?|placar|previsão|cotação|tempo|clima|trânsito|transito|weekend|semana|month|today|now|current|update|data|amanhã)\b/i.test(incoming)
        )
      ) {
        const { answer } = await perplexityService.search(incoming, cityForPrompt);
        mainAnswer = answer || '';
        usedModel = 'Perplexity';
        if (!mainAnswer || mainAnswer.length < 20) {
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
          usedModel = 'GPT-4.1 (fallback)';
        }
      } else {
        // All other intents: GPT-4.1, always city-aware
        const gpt = await openai.chat.completions.create({
          model: 'gpt-4.1',
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: ZAZIL_PROMPT },
            { role: 'user', content: incoming + (cityForPrompt && !incoming.toLowerCase().includes(cityForPrompt.toLowerCase()) ? ` em ${cityForPrompt}` : '') }
          ]
        });
        mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
        usedModel = 'GPT-4.1';
      }
      console.log(`[AI] Answer generated by: ${usedModel}`);
    } catch (err) {
      console.error('[AI ERROR]', err);
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
      usedModel = 'GPT-4.1 (double fallback)';
    }

    // NEW: Marketplace Dica Orchestration!
    let marketplaceDica = '';
    try {
      marketplaceDica = await getMarketplaceDica({ message: incoming, city, context: memorySummary });
    } catch (e) {
      console.error('[Marketplace Dica] Error:', e);
      marketplaceDica = '';
    }

    // Compose and truncate for WhatsApp
    let finalContent = mainAnswer && mainAnswer.trim();
    if (marketplaceDica) {
      finalContent += `\n\n${marketplaceDica}`;
    } else if (['GENERIC', 'NEWS'].includes(intent)) {
      // Fallback to generic trust dica if no marketplace dica
      finalContent += '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
    finalContent = finalContent.trim();

    let replyObj = replyHelper.generic(finalContent);
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

    // Fallback for empty replyObj; truncate long replies
    let safeContent = replyHelper.fallback().content;
    if (replyObj && typeof replyObj.content === 'string' && replyObj.content.trim()) {
      safeContent = truncateForWhatsapp(replyObj.content, 950);
    } else {
      console.warn('[Zazil] No replyObj or content found — using fallback.');
    }

    // Final check: too short, broken, fallback
    if (
      safeContent.length < 80 ||
      /^1\.\s*$/.test(safeContent.trim()) ||
      safeContent.startsWith('Dica do Zazil')
    ) {
      safeContent = replyHelper.fallback().content;
    }

    console.log(`[index.cjs] Intent: ${intent} | Outgoing reply length: ${safeContent.length} | Used model: ${usedModel}`);

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