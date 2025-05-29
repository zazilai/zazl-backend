// index.cjs
require('dotenv').config();
const express       = require('express');
const bodyParser    = require('body-parser');
const admin         = require('firebase-admin');
const { OpenAI }    = require('openai');

// Helpers & Services
const classifyIntent = require('./helpers/classifyIntent');
const replyHelper    = require('./helpers/reply');
const loggerMw       = require('./middleware/logger');
const groovooService = require('./services/groovoo');
const dolarService   = require('./services/dolar');
const newsService    = require('./services/news');
const profileSvc     = require('./services/profile');

// ─────────────────────────────────────────────────────────────────────────────
// App & SDK initialization
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Health‐check
app.get('/', (req, res) => res.send('✅ Zazil backend up'));

// Public FX JSON endpoint
app.get('/api/dolar', async (req, res) => {
  try {
    const rateObj = await dolarService.getRate();
    res.json(rateObj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Main Twilio WhatsApp webhook
app.post(
  '/twilio-whatsapp',
  loggerMw(db),
  async (req, res) => {
    const incoming = (req.body.Body || '').trim();
    const waNumber = req.body.From;

    try {
      // 1) Load or create user profile (plan, locale, etc.)
      const userProfile = await profileSvc.load(db, waNumber);

      // 2) Classify intent
      const intent = await classifyIntent(incoming);

      let replyObj;  // { content: string, tokens?: number }

      // 3) Route to the right service
      switch (intent) {
        case 'EVENT': {
          const events = await groovooService.getEvents(incoming);
          replyObj = replyHelper.events(events);
          break;
        }
        case 'FX': {
          const rate = await dolarService.getRate();
          replyObj = replyHelper.dolar(rate);
          break;
        }
        case 'NEWS': {
          const digest = await newsService.getDigest();
          replyObj = replyHelper.news(digest);
          break;
        }
        default: {
          // generic GPT fallback
          const gpt = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.7,
            messages: [
              { role: 'system', content: process.env.ZAZIL_PROMPT },
              { role: 'user',   content: incoming }
            ]
          });
          replyObj = replyHelper.generic(
            gpt.choices[0]?.message?.content ?? ''
          );
        }
      }

      // 4) Persist usage for quotas/analytics
      await profileSvc.updateUsage(
        db,
        waNumber,
        replyObj.tokens || 0
      );

      // 5) Send TwiML back to Twilio
      res.type('text/xml');
      res.send(
        `<Response><Message>${replyObj.content}</Message></Response>`
      );

    } catch (err) {
      console.error('[twilio-whatsapp] error:', err);
      res.type('text/xml');
      res.send(
        `<Response><Message>Desculpe, ocorreu um erro interno. Tente novamente mais tarde.</Message></Response>`
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Zazil backend listening on ${PORT}`)
);
