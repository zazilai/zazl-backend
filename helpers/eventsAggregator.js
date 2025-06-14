// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexity = require('./perplexity');

async function aggregateEvents(userMessage) {
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // 1. Busca todos eventos futuros
  const groovooEvents = await groovoo.getEvents(userMessage);
  console.log('[eventsAggregator] groovooEvents:', groovooEvents.length);

  let filteredEvents = groovooEvents;

  // 2. Se for pergunta de cidade e não achou nada, tenta Perplexity
  if (city && (!filteredEvents || filteredEvents.length === 0)) {
    const { answer } = await perplexity.search(
      `Quais eventos brasileiros, festas ou shows tem em ${city} nos próximos dias?`
    );
    console.log('[eventsAggregator] Perplexity answer:', answer);
    return { events: [], fallbackText: answer };
  }

  // 3. Se for pedido genérico, retorna eventos futuros (até 6)
  if (!city && (!filteredEvents || filteredEvents.length === 0)) {
    const { answer } = await perplexity.search(
      'Quais os próximos eventos brasileiros nos EUA?'
    );
    console.log('[eventsAggregator] Perplexity answer:', answer);
    return { events: [], fallbackText: answer };
  }

  // 4. Se achou eventos, retorna normal
  return { events: filteredEvents, fallbackText: '' };
}

module.exports = { aggregateEvents };