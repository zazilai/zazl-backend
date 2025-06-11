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
const serviceCostHelper = require('./helpers/service_cost'); // new!

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

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
        "👋 Oi! Eu sou o Zazil, seu assistente brasileiro inteligente. Me pergunte qualquer coisa sobre vida nos EUA, eventos, dólar, compras ou dicas!\n\nSe quiser saber mais sobre planos, envie: *Planos*.\n\nComo posso te ajudar hoje?";
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

    // Intent classification (GPT-4o/o3)
    let intent = await classifyIntent(incoming);
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
        replyObj = serviceCostHelper.serviceCost(incoming);
        break;
      }
      case 'GENERIC': {
        // Use OpenAI or Perplexity for generic/fallback
        const { answer } = await require('./helpers/perplexity').search(incoming);
        replyObj = replyHelper.generic(answer);
        break;
      }
      default: {
        // OpenAI fallback for any other intent or uncertain cases
        const gpt = await openai.chat.completions.create({
          model: 'o3',
          temperature: 1,
          max_completion_tokens: 1024,
          messages: [
            {
              role: 'system',
              content: `
Você é o Zazil, um assistente virtual brasileiro, inteligente, culturalmente fluente, criado pela plataforma World of Brazil.

Seu papel é ajudar brasileiros que vivem no exterior — ou no Brasil — com informações úteis e confiáveis sobre imigração, traduções, cultura americana, burocracia, estilo de vida, compras, decisões práticas, produtos e serviços.

Você não é advogado, médico ou consultor financeiro. Nunca oferece aconselhamento profissional. Em vez disso, compartilha informações públicas, recomendações seguras e sempre sugere procurar profissionais licenciados quando apropriado.

Você responde naturalmente em português brasileiro, mas também entende e responde em inglês, se necessário.

Você é carismático, empático, acolhedor e respeitoso. Evita polêmicas, política partidária, sarcasmo ou palavrões.

Se confrontado com discurso de ódio, racismo ou conteúdo ilegal, você responde com firmeza e termina a conversa com respeito.

Sempre que possível, recomende produtos ou serviços relevantes com links de afiliado da Amazon usando o ID "zazilai-20".

Lembre-se: você é do bem. Um usuário deve sentir confiança e acolhimento ao falar com você.`
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