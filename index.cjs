// index.cjs — Zazil 2025: Agentic, Hybrid AI with Low Hallucination (FINAL PRODUCTION)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const twilio = require('twilio');
const axios = require('axios');
const { OpenAI } = require('openai');

const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const getMarketplaceDica = require('./helpers/marketplaceDica');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const ZAZIL_PROMPT = require('./zazilPrompt');
const agentTools = require('./helpers/agentTools');

const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');

const db = admin.firestore();
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen - 40).trim() + '\n...(resposta resumida)';
}

const isCancel = text =>
  /\bcancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?\b/.test(text) ||
  text.includes('cancelar zazil') ||
  text.includes('cancel my plan') ||
  text.includes('cancel subscription');

const greetingRegex = /\b(oi|olá|ola|hello|hi|eai|eaí|salve)[,.!\s\-]*(zazil)?\b/i;

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);
app.get('/', (req, res) => res.send('✅ Zazil backend up'));

app.post('/twilio-whatsapp', loggerMw(db), (req, res) => {
  res.type('text/xml').send('<Response/>');
  setImmediate(async () => {
    const incoming = (req.body.Body || '').trim();
    const waNumber = req.body.From;
    const incomingLower = incoming.toLowerCase();

    try {
      const { wasNew } = await profileSvc.load(db, waNumber);
      if (wasNew) {
        await twilioClient.messages.create({
          body: replyHelper.welcome(waNumber).content,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      const quota = await profileSvc.getQuotaStatus(db, waNumber);
      if (!quota.allowed) {
        await twilioClient.messages.create({
          body: replyHelper.upgrade(waNumber).content,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      if (isCancel(incomingLower)) {
        await twilioClient.messages.create({
          body: replyHelper.cancel(waNumber).content,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      if (greetingRegex.test(incoming)) {
        await twilioClient.messages.create({
          body: replyHelper.greeting(),
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      // Load profile
      const profile = await profileSvc.getProfile(db, waNumber);
      const memorySummary = profile.memory || '';
      const city = profile.city || '';

      // Get conversation context
      const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);

      // Agentic Flow
      let messages = [
        { role: 'system', content: ZAZIL_PROMPT },
        { role: 'user', content: incoming + (memoryContext ? ` (contexto anterior: ${memoryContext})` : '') + (city ? ` (usuário em ${city})` : '') }
      ];

      let response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: agentTools.tools, // Includes new USCIS tool
        tool_choice: 'auto'
      });

      let toolCalls = response.choices[0].message.tool_calls;
      let toolResponses = [];

      if (toolCalls) {
        for (const toolCall of toolCalls) {
          const toolResponse = await agentTools.executeTool(toolCall);
          toolResponses.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolCall.function.name,
            content: toolResponse
          });
        }
        messages = messages.concat(response.choices[0].message, toolResponses);
        response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages
        });
      }

      let mainAnswer = response.choices[0].message.content || '';

      // Marketplace Dica fallback
      let marketplaceDica = '';
      if (!toolCalls || toolCalls.length === 0) {
        marketplaceDica = await getMarketplaceDica({ message: incoming, city, context: memorySummary });
      }

      let dicasBlock = marketplaceDica ? `\n\n${marketplaceDica}` : '\n\nDica do Zazil: Sempre confira em fontes oficiais!';

      let fullContent = mainAnswer.trim() + dicasBlock;

      // Fact-check
      const factCheck = await perplexityService.search(`Verify: ${fullContent.slice(0, 200)}`);
      if (factCheck.answer.includes('incorrect') || factCheck.answer.includes('hallucination')) {
        fullContent = 'Desculpe, detectei uma possível imprecisão. Aqui vai uma versão verificada: ' + factCheck.answer;
      }

      // Truncation with Firestore
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

      // Postprocess
      let replyObj = replyHelper.generic(safeContent);
      replyObj = await postprocess(replyObj, incoming);

      // Update memory
      const summary = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Resuma a conversa em 1 frase curta para memória permanente, apenas dados pessoais/permanentes.' },
          { role: 'user', content: incoming + '\nResposta: ' + mainAnswer }
        ]
      }).then(r => r.choices[0].message.content.trim());

      await memorySvc.updateUserSummary(waNumber, memorySummary, summary);

      // Send via Twilio
      const message = await twilioClient.messages.create({
        body: replyObj.content,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });
      console.log(`[Twilio] SID: ${message.sid}`);

      // Delivery check
      setTimeout(async () => {
        const status = await twilioClient.messages(message.sid).fetch();
        if (status.status === 'failed' || status.status === 'undelivered') {
          console.error(`[Twilio] Delivery failed SID: ${message.sid}`);
          await db.collection('deliveryErrors').add({
            waNumber,
            sid: message.sid,
            error: status.errorMessage || 'Unknown',
            timestamp: new Date()
          });
        }
      }, 5000);

    } catch (err) {
      console.error(err);
      await twilioClient.messages.create({
        body: replyHelper.fallback().content,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));