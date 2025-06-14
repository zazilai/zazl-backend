// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const ticketmaster = require('./ticketmaster');
const perplexity = require('./perplexity');

async function aggregateEvents(userMessage) {
  // Try to extract city from message
  let city = '';
  const lower = userMessage.toLowerCase();
  const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
  if (match) city = match[1].trim();

  // 1. Groovoo
  const groovooEvents = await groovoo.getEvents(userMessage);

  // 2. Ticketmaster
  let tmEvents = [];
  if (city) tmEvents = await ticketmaster.getEvents(city);

  // 3. Perplexity fallback if both are empty
  let fallbackText = '';
  if (!groovooEvents.length && !tmEvents.length) {
    const { answer } = await perplexity.search(
      `Quais eventos brasileiros, festas ou shows tem em ${city || 'minha cidade'} nos próximos dias?`
    );
    fallbackText = answer;
  }

  // Merge results (Groovoo first, then TM)
  const allEvents = [...groovooEvents, ...tmEvents];

  // Always return city for further personalization
  return { events: allEvents, fallbackText, city };
}

module.exports = { aggregateEvents };