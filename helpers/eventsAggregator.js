// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexity = require('./perplexity');

async function aggregateEvents(message) {
  // 1. Try Groovoo API first (Brazilian events in US)
  const events = await groovoo.getEvents(message);
  if (events && events.length > 0) {
    return { events, fallbackText: null };
  }

  // 2. Fallback to Perplexity search if no events found
  const { answer } = await perplexity.search(message + ' eventos brasileiros');
  return { events: [], fallbackText: answer };
}

module.exports = {
  aggregateEvents,
};