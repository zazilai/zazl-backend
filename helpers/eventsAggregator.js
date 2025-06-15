// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexityService = require('./perplexity');

/**
 * Attempts to extract city from message or memory.
 * (Can be improved with smarter NLP, but this covers basic cases)
 */
function extractCity(message = '', memory = '') {
  const lower = (message + ' ' + memory).toLowerCase();
  // Expand this list with more cities as needed
  const cityList = [
    'austin', 'miami', 'fort lauderdale', 'orlando', 'boston', 'houston', 'worcester', 'new york', 'dallas', 'atlanta', 'chicago'
    // Add more as needed
  ];
  for (const city of cityList) {
    if (lower.includes(city)) {
      // Capitalize first letter
      return city.replace(/\b\w/g, l => l.toUpperCase());
    }
  }
  return '';
}

/**
 * Aggregates events for Zazil.
 * @param {string} message - user query (may include city, type, etc)
 * @param {string} memory - user memory string (optional)
 * @returns {Promise<{ events: Array, fallbackText: string|null, city: string }>}
 */
async function aggregateEvents(message, memory = '') {
  // Extract city
  const city = extractCity(message, memory);

  let events = [];
  let error = false;
  try {
    // Optionally pass city to groovoo.getEvents if you want city filtering
    const result = await groovoo.getEvents(message, city);
    events = result.events || [];
    error = !!result.error;
  } catch (e) {
    error = true;
    events = [];
    console.error('[eventsAggregator] Error with Groovoo:', e.message);
  }

  let fallbackText = null;
  if (!error && Array.isArray(events) && events.length > 0) {
    fallbackText = null;
  } else {
    try {
      const { answer } = await perplexityService.search(message);
      fallbackText = answer && answer.trim() ? answer.trim() : 'Não encontrei eventos para sua busca no momento.';
    } catch (e) {
      fallbackText = 'Não consegui buscar eventos agora. Tente novamente mais tarde!';
      console.error('[eventsAggregator] Perplexity fallback error:', e.message);
    }
  }

  return { events, fallbackText, city };
}

module.exports = { aggregateEvents };