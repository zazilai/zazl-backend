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

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);

app.get('/', (req, res) => res.send('✅ Zazil backend up'));

app.get('/api/dolar', async (req, res) => {
  try {
    const rateObj = await dolarService.getRate();
    res.json(rateObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    // Plan limit check
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const upgradeMsg = replyHelper.upgrade(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${upgradeMsg.content}</Message></Response>`);
    }

    // Greeting detection (ALWAYS reply to basic greetings)
    const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;
    if (greetingRegex.test(incoming)) {
      const greetReply =
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, ou compras — ou peça uma dica!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // Cancelation phrase (before intent classification)
    const incomingLower = incoming.toLowerCase();
    if (
      incomingLower.includes('cancelar zazil') ||
      incomingLower.includes('cancelo zazil') ||
      incomingLower.includes('cancelar plano') ||
      incomingLower.includes('cancelar assinatura') ||
      incomingLower.includes('cancel my plan') ||
      incomingLower.includes('cancel subscription') ||
      incomingLower.includes('cancel zazil') ||
      incomingLower.match(/\bcancel\b/)
    ) {
      const cancelMsg = replyHelper.cancel(waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>${cancelMsg.content}</Message></Response>`);
    }

    // Load previous memory for prompt context (optional, scalable)
    let memorySummary = '';
    try {
      const profileDoc = await db.collection('profiles').doc(waNumber).get();
      memorySummary = profileDoc.exists ? (profileDoc.data().memory || '') : '';
    } catch (e) {
      memorySummary = '';
    }

    // Intent classification (GPT-4o, o3, or your choice)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;

    switch (intent) {
      case 'EVENT': {
        // Aggregate events from Groovoo, Ticketmaster, fallback to Perplexity if empty
        const { events, fallbackText } = await eventsAggregator.aggregateEvents(incoming);
        if (events && events.length > 0) {
          replyObj = replyHelper.events(events);
        } else if (fallbackText) {
          replyObj = replyHelper.generic(fallbackText);
        } else {
          replyObj = replyHelper.events([]);
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
        // Use Perplexity for fact-based generic questions
        const { answer } = await perplexityService.search(incoming);
        replyObj = replyHelper.generic(answer);
        break;
      }
      default: {
        // OpenAI fallback for any other intent or uncertain cases
        // —> inject memory/context if available
        let userPrompt = incoming;
        if (memorySummary && memorySummary.trim().length > 0) {
          userPrompt = `[DADOS DO USUÁRIO ATÉ AGORA]:\n${memorySummary}\n\n[PERGUNTA]:\n${incoming}`;
        }
        const gpt = await openai.chat.completions.create({
          model: 'o3',
          temperature: 1,
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

        // Save response to Firestore for truncation/view links
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

    // Run postprocess for generic/news only
    replyObj = postprocess(replyObj, incoming, intent);

    await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);

    // ——— MEMORY UPDATE (async, non-blocking) ———
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
          });
      } catch (e) {
        // Fail silently, memory is non-blocking
      }
    }

    // === ULTIMATE FALLBACK LOGIC HERE ===
    let safeContent = replyHelper.fallback().content; // << Standardized fallback
    if (replyObj && typeof replyObj.content === 'string' && replyObj.content.trim()) {
      safeContent = replyObj.content;
    } else {
      console.warn('[Zazil] No replyObj or content found — using fallback.');
    }

    res.type('text/xml');
    res.send(`<Response><Message>${safeContent}</Message></Response>`);
  } catch (err) {
    console.error('[twilio-whatsapp] error:', err);
    res.type('text/xml');
    res.send(`<Response><Message>${replyHelper.fallback().content}</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));