// index.cjs
require('dotenv').config();
console.log('‣ ZAZIL_PROMPT:', JSON.stringify(process.env.ZAZIL_PROMPT));

const express       = require('express');
const bodyParser    = require('body-parser');
const admin         = require('firebase-admin');
const { OpenAI }    = require('openai');

// Helpers & Services
const classifyIntent  = require('./helpers/classifyIntent');
const replyHelper     = require('./helpers/reply');
const loggerMw        = require('./middleware/logger');
const groovooService  = require('./services/groovoo');
const dolarService    = require('./services/dolar');
const newsService     = require('./services/news');
const profileSvc      = require('./services/profile');

// Firebase Init from FIREBASE_KEY_JSON
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db     = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ── Health check ──────────────────────
app.get('/', (req, res) => res.send('✅ Zazil backend up'));

// ── Public FX endpoint ────────────────
app.get('/api/dolar', async (req, res) => {
  try {
    const rateObj = await dolarService.getRate();
    res.json(rateObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Web view for long replies ─────────
app.get('/view/:id', async (req, res) => {
  try {
    const snap = await db.collection('responses').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).send('Resposta não encontrada');

    const data = snap.data();
    res.send(`
      <html>
        <meta charset="UTF-8" />
        <title>Zazil Resposta</title>
        <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px">
          <h2>🔍 Resposta completa de Zazil</h2>
          <p><strong>Pergunta:</strong><br>${data.prompt}</p>
          <hr>
          <p><strong>Resposta:</strong><br>${data.reply.replace(/\n/g, '<br>')}</p>
          <hr>
          <small>Enviado em: ${new Date(data.timestamp._seconds * 1000).toLocaleString('pt-BR')}</small>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Erro ao carregar a resposta.');
  }
});

// ── WhatsApp Webhook ──────────────────
app.post('/twilio-whatsapp', loggerMw(db), async (req, res) => {
  const incoming = (req.body.Body || '').trim();
  const waNumber = req.body.From;
  console.log('[twilio] got incoming:', JSON.stringify(incoming));

  try {
    await profileSvc.load(db, waNumber);

    console.log('[twilio] about to classify intent…');
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;

    switch (intent) {
      case 'EVENT': {
        const events = await groovooService.getEvents(incoming);
        console.log('[EVENT] events fetched:', events);
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
        console.log('[twilio] generic GPT fallback');

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

    // ✅ Smart fallback to prevent silent failure
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

// ── Launch App ────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));