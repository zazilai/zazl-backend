// index.cjs
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { admin } = require('./helpers/firebase');
const twilio = require('twilio');
const { OpenAI } = require('openai');
// Core helpers
const replyHelper = require('./helpers/reply');
const loggerMw = require('./middleware/logger');
const profileSvc = require('./helpers/profile');
const perplexityService = require('./helpers/perplexity');
const postprocess = require('./helpers/postprocess');
const memorySvc = require('./helpers/memory');
const agentTools = require('./helpers/agentTools');
const queryAnalyzer = require('./helpers/queryAnalyzer');
const ZAZIL_PROMPT = require('./zazilPrompt');
// Routes
const stripeWebhook = require('./routes/webhook');
const checkoutRoute = require('./routes/checkout');
const manageRoute = require('./routes/manage');
const viewRoute = require('./routes/view');
const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const app = express();
// Smart truncation that preserves Dicas
function smartTruncateForWhatsapp(content, maxLen = 950) {
  if (!content || content.length <= maxLen) return content;
  // Find where Dica starts
  const dicaRegex = /💡\s*(Dica do Zazil|Dica:|Dicas?)/i;
  const dicaMatch = content.match(dicaRegex);
  if (dicaMatch && dicaMatch.index) {
    const dicaStart = dicaMatch.index;
    const beforeDica = content.substring(0, dicaStart).trim();
    const dicaContent = content.substring(dicaStart).trim();
    // If Dica fits, truncate main content to make room
    if (dicaContent.length < 300) {
      const availableSpace = maxLen - dicaContent.length - 50; // Leave buffer
      const truncatedMain = truncateAtSentence(beforeDica, availableSpace);
      return `${truncatedMain}\n\n...(continua)\n\n${dicaContent}`;
    }
  }
  // Standard truncation if no Dica or Dica is too long
  return truncateAtSentence(content, maxLen - 50) + '\n\n...(continua)';
}
function truncateAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastExclamation = truncated.lastIndexOf('!');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastPunct = Math.max(lastPeriod, lastExclamation, lastQuestion);
  if (lastPunct > maxLen * 0.7) {
    return truncated.slice(0, lastPunct + 1).trim();
  }
  return truncated.trim();
}
const greetingRegex = /^(oi|olá|ola|hello|hi|hey|eai|eaí|salve|bom dia|boa tarde|boa noite)[,.!\s]*(zazil)?$/i;
const isCancel = text => /\b(cancel(ar|o|amento)?( minha)?( assinatura| plano| subscription)?|quero cancelar)\b/i.test(text);
// Routes setup
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(checkoutRoute);
app.use(manageRoute);
app.use(viewRoute);
app.get('/', (req, res) => res.send('✅ Zazil backend operational'));
// Main WhatsApp handler
app.post('/twilio-whatsapp', loggerMw(db), (req, res) => {
  res.type('text/xml').send('<Response/>');
  setImmediate(async () => {
    const startTime = Date.now();
    const incoming = (req.body.Body || '').trim();
    const waNumber = req.body.From;
    const incomingLower = incoming.toLowerCase();
    console.log(`\n==== [ZAZIL] New Message ====`);
    console.log(`From: ${waNumber}`);
    console.log(`Message: "${incoming}"`);
    console.log(`Time: ${new Date().toISOString()}`);

    try {
      // 1. Profile & New User Check
      const { wasNew } = await profileSvc.load(db, waNumber);
      if (wasNew) {
        await twilioClient.messages.create({
          body: replyHelper.welcome(waNumber).content,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      // 2. Quota Check
      const quota = await profileSvc.getQuotaStatus(db, waNumber);
      if (!quota.allowed) {
        const quotaMsg = quota.reason === 'trial_expired'
          ? replyHelper.trialExpired(waNumber).content
          : replyHelper.upgrade(waNumber).content;
        
        await twilioClient.messages.create({
          body: quotaMsg,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      // 3. Special Commands
      if (isCancel(incomingLower)) {
        await twilioClient.messages.create({
          body: replyHelper.cancel(waNumber).content,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      if (greetingRegex.test(incoming)) {
        const profile = await profileSvc.getProfile(db, waNumber);
        const greetingMsg = generateGreeting(profile);
        await twilioClient.messages.create({
          body: greetingMsg,
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
          to: waNumber
        });
        return;
      }

      // 4. Load User Context
      const profile = await profileSvc.getProfile(db, waNumber);
      const memorySummary = profile.memory || '';
      let city = profile.city || await memorySvc.getUserCity(waNumber);
      
      console.log(`[ZAZIL] User City: ${city || 'unknown'}`);
      console.log(`[ZAZIL] Memory Summary: ${memorySummary || 'none'}`);

      // 5. Analyze Query Intent
      const queryContext = {
        city: city,
        memory: memorySummary,
        timezone: profile.timezone || 'America/Chicago'
      };
      
      const analysis = await queryAnalyzer.analyze(incoming, queryContext);
      console.log(`[ZAZIL] Query Analysis:`, {
        intent: analysis.intent,
        needsCurrentInfo: analysis.needsCurrentInfo,
        needsLocation: analysis.needsLocation,
        confidence: analysis.confidence
      });

      // 6. Get ONLY Relevant Memory Context (if useful)
      let memoryContext = '';
      if (analysis.confidence > 0.8) {
        memoryContext = await memorySvc.getMemoryContext(waNumber, incoming);
      }
      console.log(`[ZAZIL] Memory Context: ${memoryContext || 'none'}`);

      // 7. Build Enhanced Query (without memory to avoid pollution)
      let searchQuery = incoming;
      
      // Add city only if needed
      if (analysis.needsLocation && city && !incoming.toLowerCase().includes(city.toLowerCase())) {
        const lang = incoming.match(/[a-zA-Z]/) ? 'in' : 'em';  // English vs Portuguese
        searchQuery = `${incoming} ${lang} ${city}`;
        console.log(`[ZAZIL] Added city to query: ${searchQuery}`);
      }

      // 8. Get Main Answer (Perplexity first for current info)
      let mainAnswer = '';
      let answerSource = '';
      
      try {
        console.log(`[ZAZIL] Getting main answer...`);
        
        // Always try Perplexity first for potential current info
        const perplexityResponse = await perplexityService.search(searchQuery, city);
        
        if (perplexityResponse?.answer && perplexityResponse.answer.length > 50) {
          mainAnswer = perplexityResponse.answer;
          answerSource = 'perplexity';
          console.log(`[ZAZIL] ✓ Answer from Perplexity (${mainAnswer.length} chars)`);
        } else {
          throw new Error('Insufficient Perplexity response');
        }
      } catch (perplexityError) {
        console.log(`[ZAZIL] Perplexity failed, falling back to GPT-4o...`);
        
        let mainQuery = searchQuery;
        // Add memory only for GPT fallback if relevant
        if (memoryContext) {
          mainQuery += ` (contexto relevante: ${memoryContext})`;
        }
        
        try {
          const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: ZAZIL_PROMPT },
              { role: 'user', content: mainQuery }
            ],
            temperature: 0.5,
            max_tokens: 2000
          });
          
          mainAnswer = gptResponse.choices[0].message.content || '';
          answerSource = 'gpt4o';
          console.log(`[ZAZIL] ✓ Answer from GPT-4o (${mainAnswer.length} chars)`);
        } catch (gptError) {
          console.error(`[ZAZIL] All AI services failed:`, gptError);
          mainAnswer = 'Opa, tive um probleminha técnico! 😅 Mas não desista, tente me perguntar de novo ou de outra forma!';
          answerSource = 'fallback';
        }
      }

      // 8.5 Personalize with Memory (easter-egg style, only if relevant)
      if (memoryContext && answerSource !== 'fallback') {
        try {
          const personalizeResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { 
                role: 'system', 
                content: `${ZAZIL_PROMPT}\nPersonalize the main answer subtly like a friend would, using the relevant context as an 'easter egg' reference if it naturally fits (e.g., 'Hey, building on your earlier passport question...'). Keep it warm, optional, and don't force it if irrelevant. Preserve the core answer.` 
              },
              { 
                role: 'user', 
                content: `Main answer: ${mainAnswer}\nRelevant context: ${memoryContext}\nOriginal query: ${incoming}` 
              }
            ],
            temperature: 0.6,
            max_tokens: 1800
          });
          mainAnswer = personalizeResponse.choices[0].message.content || mainAnswer;
          console.log(`[ZAZIL] Personalized with memory easter egg (${mainAnswer.length} chars)`);
        } catch (personalizeError) {
          console.error(`[ZAZIL] Personalization error:`, personalizeError);
          // Fallback to original mainAnswer
        }
      }

      // 9. Get Partner Enrichments Based on Intent
      let partnerDicas = [];
      
      if (['shopping', 'events', 'currency', 'service'].includes(analysis.intent)) {
        console.log(`[ZAZIL] Getting partner enrichments for intent: ${analysis.intent}`);
        
        try {
          // Force specific tool based on intent
          const toolMessages = [
            {
              role: 'system',
              content: `You are Zazil. User is in ${city || 'unknown city'}. 
                       Based on the intent "${analysis.intent}", you MUST use the appropriate tool:
                       - shopping → use searchAmazon
                       - events → use searchEvents
                       - currency → use getCurrencyRate
                       - service → use searchServices`
            },
            {
              role: 'user',
              content: `Query: ${incoming}\nCity: ${city || 'unknown'}`
            }
          ];
          
          // Force specific tool based on intent
          let toolChoice = 'auto';
          if (analysis.intent === 'shopping') {
            toolChoice = { type: 'function', function: { name: 'searchAmazon' } };
          } else if (analysis.intent === 'events') {
            toolChoice = { type: 'function', function: { name: 'searchEvents' } };
          } else if (analysis.intent === 'currency') {
            toolChoice = { type: 'function', function: { name: 'getCurrencyRate' } };
          } else if (analysis.intent === 'service') {
            toolChoice = { type: 'function', function: { name: 'searchServices' } };
          }
          
          const toolResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: toolMessages,
            tools: agentTools.tools,
            tool_choice: toolChoice,
            temperature: 0.2,
            max_tokens: 1000
          });
          
          const toolCalls = toolResponse.choices[0].message.tool_calls || [];
          console.log(`[ZAZIL] Tool calls:`, toolCalls.map(tc => tc.function.name));
          
          // Execute tools with city context
          for (const toolCall of toolCalls) {
            try {
              // Ensure city is in arguments
              const args = JSON.parse(toolCall.function.arguments);
              if (city && ['searchEvents', 'searchAmazon', 'searchServices'].includes(toolCall.function.name)) {
                args.city = city;
                toolCall.function.arguments = JSON.stringify(args);
              }
              
              const result = await agentTools.executeTool(toolCall);
              if (result && !result.includes('Não encontrei') && !result.includes('⚠️')) {
                partnerDicas.push(result);
              }
            } catch (toolError) {
              console.error(`[ZAZIL] Tool ${toolCall.function.name} error:`, toolError);
            }
          }
        } catch (toolsError) {
          console.error(`[ZAZIL] Tools error:`, toolsError);
        }
      }

      // 10. Combine Answer + Partner Dicas
      let fullContent = mainAnswer.trim();
      
      if (partnerDicas.length > 0) {
        // Add partner enrichments as Dica do Zazil
        fullContent += '\n\n💡 **Dica do Zazil:**\n' + partnerDicas.join('\n\n');
      } else if (!fullContent.toLowerCase().includes('dica do zazil')) {
        // Add default dica if none exists
        const defaultDicas = [
          'Sempre que precisar, estou aqui para ajudar! 💚',
          'A comunidade brasileira está sempre pronta para apoiar! 🇧🇷',
          'Com paciência e jeitinho brasileiro, tudo se resolve! 😊'
        ];
        const randomDica = defaultDicas[Math.floor(Math.random() * defaultDicas.length)];
        fullContent += `\n\n💡 **Dica do Zazil:** ${randomDica}`;
      }

      // 11. Postprocess for Quality
      let replyObj = replyHelper.generic(fullContent);
      replyObj = await postprocess(replyObj, incoming);
      
      // 12. Handle Smart Truncation
      let finalMessage = replyObj.content;
      
      if (finalMessage.length > 950) {
        // Store full response
        const docRef = await db.collection('longReplies').add({
          waNumber,
          question: incoming,
          answer: finalMessage,
          intent: analysis.intent,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Smart truncate preserving Dica
        const truncated = smartTruncateForWhatsapp(finalMessage, 850);
        finalMessage = `${truncated}\n\n📖 Resposta completa: https://zazl-backend.onrender.com/view/${docRef.id}`;
      }

      // 13. Send Message
      const sentMessage = await twilioClient.messages.create({
        body: finalMessage,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`[ZAZIL] ✓ Message sent: ${sentMessage.sid} (${responseTime}ms)`);

      // 14. Update Memory (only if high confidence)
      if (analysis.confidence > 0.7 && answerSource !== 'fallback') {
        await memorySvc.updateUserSummary(waNumber, memorySummary, incoming, mainAnswer);
      }

      // 15. Update Usage
      await profileSvc.updateUsage(db, waNumber, 1);

    } catch (criticalError) {
      console.error(`[ZAZIL] CRITICAL ERROR:`, criticalError);
      await twilioClient.messages.create({
        body: replyHelper.fallback().content,
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: waNumber
      });
    }
  });
});
// Helper: Generate personalized greeting
function generateGreeting(profile) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const cityPart = profile.city ? ` aqui em ${profile.city}` : '';
  return `${timeGreeting}! 😊 Como posso ajudar você hoje${cityPart}?

Posso te ajudar com:

🛒 Encontrar produtos brasileiros
🎉 Eventos da comunidade
💵 Cotação do dólar
📝 Revisar textos e traduções
💡 Dicas sobre vida no exterior

É só me perguntar! 💚`;
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Zazil backend listening on ${PORT}`));