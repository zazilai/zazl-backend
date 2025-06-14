// index.cjs

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const eventsAggregator = require('./helpers/eventsAggregator');
const dolarService = require('./helpers/dolar');
const newsService = require('./helpers/news');
const profileSvc = require('./helpers/profile');
const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');
const amazonService = require('./helpers/amazon');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const serviceCost = require('./helpers/service_cost');
const ZAZIL_PROMPT = require('./zazilPrompt');

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const TRUNC_LINK = 'https://zazl-backend.onrender.com/view/';

// Stripe webhook route
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);

app.get('/', (req, res) => res.send('✅ Zazil backend up'));

// Dollar rate route
app.get('/api/dolar', async (req, res) => {
  try {
    const rateObj = await dolarService.getRate();
    res.json(rateObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WhatsApp webhook
app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  console.log('[twilio] got incoming:', JSON.stringify(incoming));

  // --- ALERT OPT-IN / OPT-OUT SHORT-CIRCUIT ---
  const {
    getPendingAlertOptIn,
    addAlert,
    clearPendingAlertOptIn,
    hasActiveAlert,
    removeAlert,
    getProfile,
    setPendingAlertOptIn
  } = require('./helpers/profile');
  const AFFIRMATIVE_REGEX = /\b(sim|yes|quero( alerta)?|claro|pode ser)\b/i;
  const OPTOUT_REGEX = /\b(parar avis(o|os)?|cancelar( alerta)?|stop( alert)?|remover( alerta)?|não quero( mais)?( alerta)?)\b/i;

  // 1. Check if user has a pending opt-in and their message is affirmative
  const pendingOptIn = await getPendingAlertOptIn(db, waNumber);
  if (pendingOptIn && pendingOptIn.city && AFFIRMATIVE_REGEX.test(incoming)) {
    await addAlert(db, waNumber, pendingOptIn.city);
    await clearPendingAlertOptIn(db, waNumber);
    res.type('text/xml');
    return res.send(`<Response><Message>Fechado! Vou te avisar quando rolar novidade de evento brasileiro em ${pendingOptIn.city}.</Message></Response>`);
  }

  // 2. Check if user wants to opt-out of event alerts for any city they're subscribed to
  const userProfile = await getProfile(db, waNumber);
  const userAlerts = Array.isArray(userProfile.alerts) ? userProfile.alerts : [];
  let matchedCity = '';
  if (userAlerts.length && OPTOUT_REGEX.test(incoming)) {
    // Try to match city mentioned in message, otherwise remove all
    for (const alert of userAlerts) {
      if (incoming.toLowerCase().includes((alert.city || '').toLowerCase())) {
        matchedCity = alert.city;
        break;
      }
    }
    if (matchedCity) {
      await removeAlert(db, waNumber, matchedCity);
      res.type('text/xml');
      return res.send(`<Response><Message>Pronto, não vou mais enviar alertas de eventos para ${matchedCity}. Se quiser reativar, é só pedir!</Message></Response>`);
    } else {
      // Remove all alerts if no city specified
      for (const alert of userAlerts) {
        await removeAlert(db, waNumber, alert.city);
      }
      res.type('text/xml');
      return res.send(`<Response><Message>Pronto, não vou mais enviar alertas de eventos para você. Se quiser reativar, é só pedir!</Message></Response>`);
    }
  }

  try {
    // Onboarding for new users
    const { wasNew } = await profileSvc.load(db, waNumber);
    if (wasNew) {
      const welcomeMsg = replyHelper.welcome(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${welcomeMsg.content}</Message></Response>`);
    }

    // Plan limit check
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
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

    // Memory context for prompt
    let memorySummary = '';
    try {
      const profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
    } catch (e) {
      memorySummary = '';
    }

    // Intent detection (GPT-4.1, temp=0.3)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;
    let eventsCity = '';

    switch (intent) {
      case 'CANCEL': {
        replyObj = replyHelper.cancel(waNumber);
        break;
      }
      case 'EVENT': {
        // EVENTS with fallback and city handling
        const { events, fallbackText, city } = await eventsAggregator.aggregateEvents(incoming);
        eventsCity = city || '';
        if (events && events.length > 0) {
          replyObj = replyHelper.events(events, city, fallbackText);
          if (eventsCity) await setPendingAlertOptIn(db, waNumber, eventsCity);
        } else if (fallbackText) {
          replyObj = replyHelper.events([], city, fallbackText);
          if (city) await setPendingAlertOptIn(db, waNumber, city);
        } else {
          replyObj = replyHelper.generic("Não encontrei nenhum evento relevante agora, mas continuo pesquisando novidades pra você! 😉");
        }
        break;
      }
      case 'FX': {
        const rate = await dolarService.getRate();
        replyObj = replyHelper.dolar(rate);
        break;
      }
      case 'NEWS': {
        const digest = await newsService.getDigest(incoming);
        replyObj = replyHelper.news(digest);
        break;
      }
      case 'AMAZON': {
        const items = await amazonService.searchAmazonProducts(incoming);
        replyObj = replyHelper.amazon(items);
        break;
      }
      case 'SERVICE_COST': {
        replyObj = serviceCost.serviceCost(incoming);
        break;
      }
      case 'GENERIC': {
        const { answer } = await perplexityService.search(incoming);
        replyObj = replyHelper.generic(answer);
        break;
      }
      default: {
        let userPrompt = incoming;
        if (memorySummary && memorySummary.trim().length > 0) {
          userPrompt = `[DADOS DO USUÁRIO ATÉ AGORA]:\n${memorySummary}\n\n[PERGUNTA]:\n${incoming}`;
        }
        const gpt = await openai.chat.completions.create({
          model: 'gpt-4.1',
          temperature: 0.3,
          max_completion_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: ZAZIL_PROMPT
            },
            { role: 'user', content: userPrompt }
          ]
        });

        let content = gpt.choices?.[0]?.message?.content || '';

        const docRef = await db.collection('responses').add({
          user: waNumber,
          prompt: incoming,
          reply: content,
          timestamp: new Date()
        });

        const docId = docRef.id;
        const MAX_LEN = 1600;
        if (content.length > MAX_LEN) {
          const cut = content.lastIndexOf('\n', MAX_LEN);
          const safeCut = cut > 0 ? cut : MAX_LEN;
          content = content.slice(0, safeCut) +
            `\n\n✂️ *Resposta truncada.* Veja tudo aqui:\n${TRUNC_LINK}${docId}`;
        }

        replyObj = replyHelper.generic(content);
      }
    }

    // Postprocess for generic/news
    replyObj = postprocess(replyObj, incoming, intent);

    await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);

    // MEMORY UPDATE (async)
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
          .catch(err => {
            console.error('[MEMORY] Error in updateUserSummary:', err);
          });
      } catch (e) {
        console.error('[MEMORY] Outer error:', e);
      }
    }

    // Standardized fallback (never blank)
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
    // OUTAGE FALLBACK if Firestore/Firebase/network error
    if (
      (err.message && err.message.match(/firestore|firebase|unavailable|timeout|network/i)) ||
      (err.code && err.code.toString().includes('unavailable'))
    ) {
      res.type('text/xml');
      return res.send(`<Response><Message>${replyHelper.fallbackOutage().content}</Message></Response>`);
    }
    // Otherwise, normal fallback
    res.type('text/xml');
    res.send(`<Response><Message>${replyHelper.fallback().content}</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));