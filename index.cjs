require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

const classifyIntent = require('./helpers/classifyIntent');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const groovooService = require('./helpers/groovoo');
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

    // 3. Memory Wipe: /apagar or "esquecer tudo"
    if (/^(\/apagar|esquecer tudo)$/i.test(incoming)) {
      await profileSvc.wipeMemory(db, waNumber);
      res.type('text/xml');
      return res.send(`<Response><Message>Sua memória foi apagada. Não guardo mais nenhum dado da sua conversa anterior. — Zazil</Message></Response>`);
    }

    // 4. Greeting detection
    const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;
    if (greetingRegex.test(incoming)) {
      const greetReply =
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, ou compras — ou peça uma dica!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
      await profileSvc.saveMemory(db, waNumber, 'user', incoming);
      await profileSvc.saveMemory(db, waNumber, 'zazil', greetReply);
      res.type('text/xml');
      return res.send(`<Response><Message>${greetReply}</Message></Response>`);
    }

    // 5. Cancelation phrase (before intent classification)
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
      await profileSvc.saveMemory(db, waNumber, 'user', incoming);
      await profileSvc.saveMemory(db, waNumber, 'zazil', cancelMsg.content);
      res.type('text/xml');
      return res.send(`<Response><Message>${cancelMsg.content}</Message></Response>`);
    }

    // 6. Load memory and summary
    const memory = await profileSvc.loadMemory(db, waNumber);
    const summary = await profileSvc.loadSummary(db, waNumber);

    // 7. Intent classification (GPT-4o, o3, etc)
    const intent = await classifyIntent(incoming);
    console.log('[twilio] classifyIntent →', intent);

    let replyObj;
    let answer = '';
    let aiAnswerUsed = false;

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
        const { answer: perplexityAns } = await perplexityService.search(incoming);
        answer = await postprocess(perplexityAns, incoming, waNumber, memory, summary);
        replyObj = replyHelper.generic(answer);
        aiAnswerUsed = true;
        break;
      }
      default: {
        // OpenAI fallback for any other intent or uncertain cases (with memory)
        const messages = [
          {
            role: 'system',
            content: `
Você é o Zazil, um assistente virtual brasileiro, inteligente e culturalmente fluente, criado pela plataforma World of Brazil.
Seu papel é ajudar brasileiros que vivem no exterior — ou no Brasil — com informações úteis e confiáveis sobre imigração, traduções, cultura americana, burocracia, estilo de vida, compras, e decisões práticas do dia a dia.
${summary ? `Resumo do usuário: ${summary}` : ''}
Aqui estão as últimas conversas do usuário:
${memory.map(m => `• ${m.role === 'user' ? 'Usuário' : 'Zazil'}: ${m.content}`).join('\n')}
Responda de forma calorosa e personalizada.
Você não é advogado, médico ou consultor financeiro. Nunca oferece aconselhamento profissional. Sempre sugira procurar profissionais licenciados quando apropriado.
`
          },
          { role: 'user', content: incoming }
        ];

        const gpt = await openai.chat.completions.create({
          model: 'o3',
          max_completion_tokens: 2048,
          messages
        });

        answer = gpt.choices?.[0]?.message?.content || '';
        answer = await postprocess(answer, incoming, waNumber, memory, summary);
        replyObj = replyHelper.generic(answer);
        aiAnswerUsed = true;
      }
    }

    // Save to memory (user and assistant)
    await profileSvc.saveMemory(db, waNumber, 'user', incoming);
    if (aiAnswerUsed) await profileSvc.saveMemory(db, waNumber, 'zazil', answer);
    else if (replyObj && replyObj.content) await profileSvc.saveMemory(db, waNumber, 'zazil', replyObj.content);

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