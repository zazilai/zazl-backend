// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexity = require('./perplexity');

async function aggregateEvents(userMessage) {
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // Busca todos eventos futuros
  const groovooEvents = await groovoo.getEvents(userMessage);
  console.log('[eventsAggregator] groovooEvents:', groovooEvents.length);

  // Se cidade específica e não achou nada, tenta Perplexity
  if (city && (!groovooEvents || groovooEvents.length === 0)) {
    const { answer } = await perplexity.search(
      `Quais eventos brasileiros, festas ou shows tem em ${city} nos próximos dias?`
    );
    console.log('[eventsAggregator] Perplexity answer:', answer);
    return { events: [], fallbackText: answer };
  }

  // Se pergunta genérica e não achou nada, Perplexity
  if (!city && (!groovooEvents || groovooEvents.length === 0)) {
    const { answer } = await perplexity.search(
      'Quais os próximos eventos brasileiros nos EUA?'
    );
    console.log('[eventsAggregator] Perplexity answer:', answer);
    return { events: [], fallbackText: answer };
  }

  // Se achou eventos, retorna normal
  return { events: groovooEvents, fallbackText: '' };
}

module.exports = { aggregateEvents };