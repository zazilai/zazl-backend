// index.cjs — Zazil 2025 MVP: Always AI Answer + Brazilian Layer (Marketplace Dica), Bulletproof Truncation & Logs

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

// Only real keywords: cancel, greeting (user experience)
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

app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  const incomingLower = incoming.toLowerCase();

  try {
    // Onboard if new
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    // Quota check
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const upgradeMsg = replyHelper.upgrade(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    // CANCEL (user experience only!)
    if (isCancel(incomingLower)) {
      const cancelMsg = replyHelper.cancel(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${cancelMsg.content}</Message></Response>`);
    }

    // GREETING
    if (greetingRegex.test(incoming)) {
      const greetReply = replyHelper.greeting();
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // Load personalization
    let profileDoc, memorySummary = '', city = '';
    try {
      profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
      city = profileDoc.exists && profileDoc.data().city ? profileDoc.data().city : '';
    } catch (e) { city = ''; }

    // Detect intent and handle follow-ups
    let intent = 'none';
    let previousQuery = '';
    try {
      const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
      if (memoryContext) {
        const [lastQuery] = memoryContext.split(' | ').filter(q => q.includes('asked')).pop() || '';
        if (lastQuery) previousQuery = lastQuery.replace(/asked: /, '');
      }
      const intentRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 20,
        messages: [
          { role: 'system', content: 'Classifique a intenção como: "event", "current", "shopping", "feedback", "follow-up", ou "none".' },
          { role: 'user', content: incoming + (previousQuery ? ` (contexto anterior: ${previousQuery})` : '') }
        ]
      });
      intent = intentRes.choices?.[0]?.message?.content?.trim().split(':')[1] || 'none';
    } catch (e) { console.error('[INTENT] Error:', e); intent = 'none'; }

    // Future-proof current detector
    const isCurrentQuestion = (text) =>
      /\b(hoje|amanhã|agora|notícia|noticias|aconteceu|última hora|breaking|resultados?|placar|previsão|cotação|tempo|clima|trânsito|transito|weekend|semana|month|today|now|current|update|data|evento|show|agenda)\b/i.test(text);

    // MAIN ANSWER: Model selection based on intent
    let mainAnswer = '';
    let usedModel = '';
    const cityForPrompt = city && city.length > 1 && city.toLowerCase() !== 'eua' ? city : (intent === 'event' && !city ? 'por favor, me diga sua cidade' : 'EUA');

    try {
      if (intent === 'current' || isCurrentQuestion(incoming)) {
        const { answer } = await perplexityService.search(incoming, cityForPrompt);
        mainAnswer = answer || '';
        usedModel = 'Perplexity';
        if (!mainAnswer || mainAnswer.length < 30) {
          const gpt = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.3,
            max_tokens: 2048,
            messages: [{ role: 'system', content: ZAZIL_PROMPT }, { role: 'user', content: incoming }]
          });
          mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
          usedModel = 'GPT-4o (fallback)';
        }
      } else {
        const gpt = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: ZAZIL_PROMPT },
            { role: 'user', content: incoming + (cityForPrompt && !incoming.toLowerCase().includes(cityForPrompt.toLowerCase()) ? ` em ${cityForPrompt}` : '') }
          ]
        });
        mainAnswer = gpt.choices?.[0]?.message?.content || "Desculpe, não consegui responder sua pergunta agora.";
        usedModel = 'GPT-4o';
      }
      console.log(`[AI] Answer generated by: ${usedModel}`);
    } catch (err) {
      console.error('[AI ERROR]', err);
      mainAnswer = "Desculpe, não consegui responder sua pergunta agora.";
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

    // Always append the Marketplace Dica (Brazilian Layer) if found; otherwise fallback
    let dicasBlock = '';
    if (marketplaceDica && marketplaceDica.trim().length > 3) {
      dicasBlock = `\n\n${marketplaceDica.trim()}`;
    } else {
      dicasBlock = '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }

    // Compose full message for truncation handling
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

    // Run postprocess (if needed)
    let replyObj = replyHelper.generic(safeContent);
    replyObj = postprocess(replyObj, incoming);

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