require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const eventsAggregator = require('./helpers/eventsAggregator'); // NEW
const dolarService = require('./helpers/dolar');
const newsService = require('./helpers/news');
const profileSvc = require('./helpers/profile');
const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');
const amazonService = require('./helpers/amazon');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess'); // Zazil flavor!

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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

    // **Greeting detection (ALWAYS reply to basic greetings)**
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

    // Intent classification (GPT-4o, o3, etc.)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;

    switch (intent) {
      case 'EVENT': {
        const { events, fallbackText } = await eventsAggregator.aggregateEvents(incoming);
        let replyText;
        if (events.length) {
          replyText = replyHelper.events(events).content;
        } else if (fallbackText) {
          replyText = `🎉 *Eventos (resposta via IA):*\n\n${fallbackText}`;
        } else {
          replyText = '📅 Nenhum evento encontrado no momento. Tente novamente mais tarde!';
        }
        replyObj = replyHelper.generic(replyText);
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
      case 'GENERIC': {
        // Use Perplexity for fact-based generic questions
        const { answer } = await perplexityService.search(incoming);
        // Optionally post-process for Zazil flavor
        const processed = await postprocess(answer, incoming, waNumber);
        replyObj = replyHelper.generic(processed);
        break;
      }
      default: {
        // OpenAI fallback for any other intent or uncertain cases
        const gpt = await openai.chat.completions.create({
          model: 'o3',
          max_completion_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: `
### Role:
You are Zazil, a culturally fluent, loving AI assistant created by World of Brazil. You were designed to help Brazilians living abroad with useful, general information about immigration, language, culture, services, products, and daily life.
[...Include full system prompt here from your best version...]
`
            },
            { role: 'user', content: incoming }
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
            `\n\n✂️ *Resposta truncada.* Veja tudo aqui:\nhttps://zazil.ai/view/${docId}`;
        }

        // Optionally post-process for Zazil flavor
        const processed = await postprocess(content, incoming, waNumber);
        replyObj = replyHelper.generic(processed);
      }
    }

    await profileSvc.updateUsage(db, waNumber, replyObj.tokens || 0);

    let safeContent = 'Desculpe, não consegui entender.';
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
    res.send(`<Response><Message>Desculpe, ocorreu um erro interno. Tente novamente mais tarde.</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));