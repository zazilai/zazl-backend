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

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ── Health check ─────────────────────
app.get('/', (req, res) => res.send('✅ Zazil backend up'));

// ── FX API endpoint ──────────────────
app.get('/api/dolar', async (req, res) => {
  try {
    const rateObj = await dolarService.getRate();
    res.json(rateObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WhatsApp Webhook ─────────────────
app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  console.log('[twilio] got incoming:', JSON.stringify(incoming));

  try {
    const profile = await profileSvc.load(db, waNumber);

    // Welcome message for first-time users
    if (profile?.isNew) {
      const welcome = `👋 Prazer em conhecer! Eu sou o *Zazil*, seu assistente cultural brasileiro.

🧠 Respondo melhor quando você escreve sua pergunta completa em uma única mensagem (sem áudios!).

💬 Posso ajudar com inglês, cultura americana, burocracias, eventos, e outras dicas do dia-a-dia.

🔒 Ao usar o Zazil, você aceita nossos [termos](https://worldofbrazil.ai/termos) e [privacidade](https://worldofbrazil.ai/privacidade).

Manda aí sua primeira pergunta! 😉`;
      res.type('text/xml');
      return res.send(`<Response><Message>${welcome}</Message></Response>`);
    }

    // Enforce message quota
    const quota = await profileSvc.getQuotaStatus(db, waNumber);
    if (!quota.allowed) {
      const msg = quota.plan === 'free'
        ? '⚠️ Esta funcionalidade do Zazil está disponível apenas para assinantes do plano Lite ou Pro. Assine aqui: https://worldofbrazil.ai/wobplus'
        : '⚠️ Você atingiu seu limite de mensagens hoje. Tente amanhã ou vá para o plano Pro ilimitado: https://worldofbrazil.ai/wobplus';
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

// ── Stripe webhook endpoint ──────────
app.use(stripeWebhook);

// ── Start App ────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));