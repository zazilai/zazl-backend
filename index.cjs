// index.cjs — Zazil Backend (Production-Ready, Great Product, 2025)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const twilio = require('twilio');
const { OpenAI } = require('openai');
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const agentTools = require('./helpers/agentTools');
const ZAZIL_PROMPT = require('./zazilPrompt');
const stripeWebhook = require('./routes/webhook');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const app = express();

function truncateForWhatsapp(msg, maxLen = 950) {
  if (!msg) return '';
  if (msg.length <= maxLen) return msg;
  const cutoff = msg.lastIndexOf('.', maxLen - 100);
  return msg.slice(0, cutoff > 0 ? cutoff + 1 : maxLen - 100).trim() + '\n\n...(continua)';
}

const greetingRegex = /^(oi|olá|ola|hello|hi|hey|eai|eaí|salve|bom dia|boa tarde|boa noite)[,.!\s]*(zazil)?$/i;
const isCancel = text =>
  /\b(cancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?|quero cancelar)\b/i.test(text);

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
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
        const msg = quota.reason === 'trial_expired'
          ? replyHelper.trialExpired(waNumber).content
          : replyHelper.upgrade(waNumber).content;
        await twilioClient.messages.create({
          body: msg,
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

      const profile = await profileSvc.getProfile(db, waNumber);
      const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
      const city = profile.city || await memorySvc.getUserCity(waNumber);

      let mainQuery = incoming;
      if ((await memorySvc.needsCityContext(incoming)) && city && !incoming.includes(city)) {
        mainQuery = `${incoming} em ${city}`;
      }
      if (memoryContext) mainQuery += ` (contexto: ${memoryContext})`;

      let mainAnswer = '';
      try {
        const perplexity = await perplexityService.search(mainQuery);
        if (perplexity?.answer?.length > 50) {
          mainAnswer = perplexity.answer;
        } else {
          throw new Error('Weak Perplexity answer');
        }
      } catch {
        const gptRes = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: ZAZIL_PROMPT },
            { role: 'user', content: mainQuery }
          ],
          temperature: 0.5
        });
        mainAnswer = gptRes.choices?.[0]?.message?.content || 'Desculpe, não consegui responder isso agora.';
      }

      let toolEnrichment = '';
      try {
        const toolRes = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${ZAZIL_PROMPT}\n\nIMPORTANTE: o usuário está em ${city || 'localização desconhecida'}`
            },
            { role: 'user', content: `Pergunta: ${incoming}\nCidade: ${city}` }
          ],
          tools: agentTools.tools,
          tool_choice: 'auto',
          temperature: 0.3
        });
        const calls = toolRes.choices?.[0]?.message?.tool_calls || [];
        const results = await Promise.all(
          calls.map(tc => agentTools.executeTool(tc).catch(() => null))
        );
        toolEnrichment = results.filter(Boolean).join('\n\n');
      } catch (err) {
        console.error('[ZAZIL] Tool enrichment failed:', err.message);
      }

      let fullContent = mainAnswer.trim();
      if (toolEnrichment) {
        fullContent += `\n\n💡 Dica do Zazil:\n${toolEnrichment}`;
      } else if (!/dica do zazil/i.test(fullContent)) {
        fullContent += '\n\n💡 Dica do Zazil: Sempre confirme informações em fontes oficiais!';
      }

      let replyObj = replyHelper.generic(fullContent);
      replyObj = await postprocess(replyObj, incoming);
      let finalMsg = replyObj.content;

      if (finalMsg.length > 950) {
        const ref = await db.collection('longReplies').add({
          waNumber,
          question: incoming,
          answer: finalMsg,
          createdAt: new Date()
        });
        const short = truncateForWhatsapp(finalMsg, 850);
        finalMsg = `${short}\n\n📖 Leia tudo: https://zazl-backend.onrender.com/view/${ref.id}`;
      }

      const sent = await twilioClient.messages.create({
        body: finalMsg,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });

      await memorySvc.updateUserSummary(waNumber, profile.memory || '', incoming, mainAnswer);
      await profileSvc.updateUsage(db, waNumber, 1);
      console.log('[ZAZIL] Respondido:', sent.sid);
    } catch (err) {
      console.error('[ZAZIL] ERRO:', err.message);
      await twilioClient.messages.create({
        body: replyHelper.fallback().content,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: req.body.From
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));