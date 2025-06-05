// index.cjs
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const groovooService = require('./services/groovoo');
const dolarService = require('./services/dolar');
const newsService = require('./services/news');
const profileSvc = require('./helpers/profile');
const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();

// Stripe webhook: must use raw body before json parsers
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// Apply body parsers for all remaining routes
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Checkout links (e.g. GET /checkout/:plan/:period?whatsapp=+15551234567)
app.use(checkoutRoute);

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
    const isFirstTime = !(await admin.firestore().collection('profiles').doc(waNumber).get()).exists;
    await profileSvc.load(db, waNumber);

    if (isFirstTime) {
      const welcome = `Prazer em te conhecer! Eu sou o Zazil, seu assistente aqui nos EUA 🇺🇸\n\nPosso ajudar com dicas para facilitar o seu dia a dia: inglês, cultura, burocracias, eventos e muito mais.\n\n👉 Ah, só um aviso: não entendo áudio. E respondo melhor se a pergunta vier completa em uma única mensagem.\n\n📎 Ao usar o Zazil, você concorda com nossos Termos e Política de Privacidade:\nworldofbrazil.ai/termos\nworldofbrazil.ai/privacidade`;
      res.type('text/xml');
      return res.send(`<Response><Message>${welcome}</Message></Response>`);
    }

    // Enforce message quota
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const msg = quota.plan === 'free'
        ? '⚠️ Esta funcionalidade do Zazil está disponível apenas para assinantes do plano Lite ou Pro. Assine em: worldofbrazil.ai'
        : '⚠️ Você atingiu seu limite de mensagens hoje. Tente novamente amanhã ou faça upgrade para Pro ilimitado em worldofbrazil.ai';

      res.type('text/xml');
      return res.send(`<Response><Message>${msg}</Message></Response>`);
    }

    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;

    switch (intent) {
      case 'EVENT': {
        const events = await groovooService.getEvents(incoming);
        replyObj = replyHelper.events(events);
        break;
      }

      case 'FX': {
        const rate = await dolarService.getRate();
        console.log('[FX] rate fetched:', rate);
        replyObj = replyHelper.dolar(rate);
        break;
      }

      case 'NEWS': {
        const digest = await newsService.getDigest();
        replyObj = replyHelper.news(digest);
        break;
      }

      default: {
        const gpt = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: process.env.ZAZIL_PROMPT },
            { role: 'user', content: incoming }
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
            `\n\n✂️ *Resposta truncada.* Veja tudo aqui:\nhttps://zazil.ai/view/${docId}`;
        }

        replyObj = replyHelper.generic(content);
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