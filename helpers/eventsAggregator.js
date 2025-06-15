// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexityService = require('./perplexity');

/**
 * Aggregates events for Zazil.
 * 1. Tries Groovoo first.
 * 2. If Groovoo fails or returns empty, always tries Perplexity.
 * 3. Returns { events, fallbackText, userQuery }.
 * 
 * @param {string} message - user query
 * @param {string} [city] - optional city from memory
 * @returns {Promise<{ events: Array, fallbackText: string|null, userQuery: string }>}
 */
async function aggregateEvents(message, city) {
  let events = [];
  let error = false;
  let usedGroovoo = false;
  try {
    const result = await groovoo.getEvents(message, city);
    events = result.events || [];
    error = !!result.error;
    usedGroovoo = true;
  } catch (e) {
    error = true;
    events = [];
    usedGroovoo = false;
    console.error('[eventsAggregator] Error with Groovoo:', e.message);
  }

  // Fallback: Perplexity always runs if events is empty
  let fallbackText = null;
  if (events.length === 0) {
    try {
      const { answer } = await perplexityService.search(message);
      fallbackText = answer && answer.trim() ? answer.trim() : null;
    } catch (e) {
      fallbackText = null;
      console.error('[eventsAggregator] Perplexity fallback error:', e.message);
    }
  }

  return { events, fallbackText, userQuery: message };
}

module.exports = { aggregateEvents };