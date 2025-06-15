// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexity = require('./perplexity');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Use LLM to check if Groovoo results match the user's question
async function isGroovooRelevant(userMessage, events) {
  if (!events || events.length === 0) return false;

  // Build event summary for LLM
  const eventList = events.map(e => `${e.name} - ${e.location || ''} - ${e.start_time || ''}`).join('\n');
  const prompt = `
Pergunta do usuário: "${userMessage}"

Eventos disponíveis:
${eventList}

Esses eventos respondem claramente à pergunta do usuário? Responda só "sim" ou "não".
  `;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 2,
      messages: [
        { role: 'system', content: 'Você é um assistente objetivo.' },
        { role: 'user', content: prompt }
      ]
    });
    const content = (response.choices?.[0]?.message?.content || '').toLowerCase();
    return content.includes('sim');
  } catch (e) {
    return false; // On error, fail safe: fallback
  }
}

async function aggregateEvents(userMessage) {
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // 1. Try Groovoo
  const groovooEvents = await groovoo.getEvents(userMessage);
  console.log('[eventsAggregator] groovooEvents:', groovooEvents.length);

  const relevant = await isGroovooRelevant(userMessage, groovooEvents);

  if (relevant && groovooEvents.length > 0) {
    return { events: groovooEvents, fallbackText: '', city };
  }

  // 2. Fallback: Perplexity always, not just on city!
  let perplexityPrompt = '';
  if (city) {
    perplexityPrompt = `Quais eventos brasileiros, festas ou shows tem em ${city} nos próximos dias?`;
  } else {
    perplexityPrompt = `Responda à pergunta do usuário sobre eventos brasileiros, festas, shows ou jogos. Seja específico se mencionar datas, locais ou times.`;
  }
  const { answer } = await perplexity.search(perplexityPrompt);
  console.log('[eventsAggregator] Perplexity answer:', answer);
  return { events: [], fallbackText: answer, city };
}

module.exports = { aggregateEvents };