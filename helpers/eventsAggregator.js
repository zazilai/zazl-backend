// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const ticketmaster = require('./ticketmaster');
const perplexity = require('./perplexity');

async function aggregateEvents(userMessage) {
  // 1. Extrai cidade (opcional)
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // 2. Groovoo (e Ticketmaster, se quiser ativar)
  const groovooEvents = await groovoo.getEvents(userMessage);
  // Se quiser usar ticketmaster, adicione aqui (opcional)
  // let tmEvents = [];
  // if (city) tmEvents = await ticketmaster.getEvents(city);

  // Junta eventos
  const allEvents = [...groovooEvents]; // [...groovooEvents, ...tmEvents] se usar TM

  // 3. Fallback: Se nenhum evento, consulta Perplexity
  let fallbackText = '';
  if (!allEvents.length) {
    const { answer } = await perplexity.search(
      `Quais eventos brasileiros, festas ou shows tem em ${city || 'minha cidade'} nos próximos dias?`
    );
    fallbackText = answer;
  }

  return { events: allEvents, fallbackText };
}

module.exports = { aggregateEvents };