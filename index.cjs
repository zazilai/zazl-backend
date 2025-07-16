// index.cjs — Zazil Backend (Production-Ready, Great Product, 2025)

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
  const truncated = msg.slice(0, maxLen - 100);
  const lastPunct = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  if (lastPunct > maxLen - 200) {
    return truncated.slice(0, lastPunct + 1) + '\n\n...(continua)';
  }
  return truncated.trim() + '\n\n...(continua)';
}

const isCancel = text =>
  /\b(cancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?|quero cancelar)\b/i.test(text) ||
  text.includes('cancelar zazil') ||
  text.includes('cancel my plan') ||
  text.includes('cancel subscription');

const greetingRegex = /^(oi|olá|ola|hello|hi|hey|eai|eaí|salve|bom dia|boa tarde|boa noite)[,.!\s]*(zazil)?$/i;

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

    console.log('==== [ZAZIL] New Message ====');
    console.log('From:', waNumber);
    console.log('Message:', incoming);
    console.log('Time:', new Date().toISOString());

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
        const quotaReply = quota.reason === 'trial_expired'
          ? replyHelper.trialExpired(waNumber).content
          : replyHelper.upgrade(waNumber).content;

        await twilioClient.messages.create({
          body: quotaReply,
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
      const memorySummary = profile.memory || '';
      let city = profile.city || '';

      if (!city) {
        city = await memorySvc.getUserCity(waNumber);
      }

      const memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
      console.log('[ZAZIL] Memory Context:', memoryContext);
      console.log('[ZAZIL] User City:', city);

      const needsCity = await memorySvc.needsCityContext(incoming);
      let queryForMainAnswer = incoming;

      if (needsCity && city && !incoming.toLowerCase().includes(city.toLowerCase())) {
        queryForMainAnswer = `${incoming} em ${city}`;
        console.log('[ZAZIL] Enhanced query with city:', queryForMainAnswer);
      }

      if (memoryContext) {
        queryForMainAnswer += ` (contexto: ${memoryContext})`;
      }

      let mainAnswer = '';
      let answerSource = '';

      try {
        console.log('[ZAZIL] Trying Perplexity...');
        const perplexityResponse = await perplexityService.search(queryForMainAnswer);
        if (perplexityResponse && perplexityResponse.answer && perplexityResponse.answer.length > 50) {
          mainAnswer = perplexityResponse.answer;
          answerSource = 'perplexity';
        } else {
          throw new Error('Perplexity response insufficient');
        }
      } catch {
        try {
          console.log('[ZAZIL] Trying Grok4...');
          const grokRes = await axios.post('https://api.x.ai/v1/chat/completions', {
            model: 'grok-4',
            temperature: 0.3,
            max_tokens: 2048,
            messages: [
              { role: 'system', content: ZAZIL_PROMPT },
              { role: 'user', content: queryForMainAnswer }
            ]
          }, {
            headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
            timeout: 8000
          });
          mainAnswer = grokRes.data.choices[0].message.content || '';
          answerSource = 'grok4';
        } catch {
          console.log('[ZAZIL] Falling back to GPT-4o...');
          const gptRes = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.5,
            max_tokens: 2048,
            messages: [
              { role: 'system', content: ZAZIL_PROMPT },
              { role: 'user', content: queryForMainAnswer }
            ]
          });
          mainAnswer = gptRes.choices[0].message.content || '';
          answerSource = 'gpt4o';
        }
      }

      console.log(`[ZAZIL] Answer from ${answerSource}, length: ${mainAnswer.length}`);

      let toolEnrichment = '';
      try {
        const toolResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${ZAZIL_PROMPT}\n\nIMPORTANT: User is in ${city || 'unknown city'}. Use this for all location-based tool calls.`
            },
            {
              role: 'user',
              content: `Query: ${incoming}\nUser city: ${city}`
            }
          ],
          tools: agentTools.tools,
          tool_choice: 'auto',
          temperature: 0.3
        });

        const toolCalls = toolResponse.choices[0].message.tool_calls || [];
        const results = await Promise.all(toolCalls.map(async (tc) => {
          try {
            const args = JSON.parse(tc.function.arguments);
            if (['searchEvents', 'searchAmazon'].includes(tc.function.name) && city) {
              args.city = city;
              tc.function.arguments = JSON.stringify(args);
            }
            return await agentTools.executeTool(tc);
          } catch (err) {
            console.error(`[ZAZIL] Tool ${tc.function.name} error:`, err);
            return null;
          }
        }));
        toolEnrichment = results.filter(Boolean).join('\n\n');
      } catch (err) {
        console.error('[ZAZIL] Tool enrichment error:', err);
      }

      let marketplaceDica = '';
      try {
        marketplaceDica = await getMarketplaceDica({
          message: incoming,
          city,
          context: memorySummary
        });
      } catch (err) {
        console.error('[ZAZIL] Marketplace dica error:', err);
      }

      let fullContent = mainAnswer.trim();
      const enrichments = [];
      if (toolEnrichment) enrichments.push(toolEnrichment);
      if (marketplaceDica && !toolEnrichment.includes(marketplaceDica)) enrichments.push(marketplaceDica);

      if (enrichments.length) {
        fullContent += '\n\n💡 Dica do Zazil:\n' + enrichments.join('\n\n');
      } else if (!/dica do zazil/i.test(fullContent)) {
        fullContent += '\n\n💡 Dica do Zazil: Sempre confirme informações em fontes oficiais!';
      }

      let replyObj = replyHelper.generic(fullContent);
      replyObj = await postprocess(replyObj, incoming);

      let finalContent = replyObj.content;
      if (finalContent.length > 950) {
        const docRef = await db.collection('longReplies').add({
          waNumber,
          question: incoming,
          answer: finalContent,
          createdAt: new Date()
        });
        const truncated = truncateForWhatsapp(finalContent, 850);
        finalContent = `${truncated}\n\n📖 Resposta completa: ${process.env.PROJECT_URL}/view/${docRef.id}`;
      }

      const message = await twilioClient.messages.create({
        body: finalContent,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });

      console.log('[ZAZIL] Message sent:', message.sid);

      await memorySvc.updateUserSummary(waNumber, memorySummary, incoming, mainAnswer);
      await profileSvc.updateUsage(db, waNumber, 1);

      setTimeout(async () => {
        try {
          const status = await twilioClient.messages(message.sid).fetch();
          if (['failed', 'undelivered'].includes(status.status)) {
            await db.collection('deliveryErrors').add({
              waNumber,
              sid: message.sid,
              error: status.errorMessage || 'Unknown',
              timestamp: new Date()
            });
          }
        } catch (err) {
          console.error('[ZAZIL] Delivery status error:', err);
        }
      }, 5000);
    } catch (err) {
      console.error('[ZAZIL] Critical error:', err);
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