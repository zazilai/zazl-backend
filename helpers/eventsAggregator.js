// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexity = require('./perplexity');

async function aggregateEvents(userMessage) {
  // 1. Extrai cidade (opcional)
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // 2. Groovoo
  const groovooEvents = await groovoo.getEvents(userMessage);
  console.log('[eventsAggregator] groovooEvents:', groovooEvents.length);

  // 3. Fallback: Se nenhum evento, consulta Perplexity
  let fallbackText = '';
  if (!groovooEvents.length) {
    const { answer } = await perplexity.search(
      `Quais eventos brasileiros, festas ou shows tem em ${city || 'minha cidade'} nos próximos dias?`
    );
    console.log('[eventsAggregator] Perplexity answer:', answer);
    fallbackText = answer;
  }

  return { events: groovooEvents, fallbackText };
}

module.exports = { aggregateEvents };