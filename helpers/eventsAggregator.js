// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexityService = require('./perplexity');

/**
 * Aggregates events for Zazil:
 * - Always tries Groovoo first (API for Brazilian events in USA)
 * - If Groovoo fails (network, server) OR returns empty, falls back to Perplexity (news/LLM)
 * - Always returns { events: [], fallbackText, city } where at least one is non-empty
 * @param {string} message - user query (may include city, type, etc)
 * @param {string} memory - user memory (for default city if needed)
 * @returns {Promise<{ events: Array, fallbackText: string|null, city: string }>}
 */
async function aggregateEvents(message, memory = '') {
  let events = [];
  let error = false;
  let city = '';
  try {
    const result = await groovoo.getEvents(message, memory);
    events = result.events || [];
    city = result.city || '';
    // Even if Groovoo returns 0 events, treat as error for user experience!
    if (!Array.isArray(events) || events.length === 0) error = true;
  } catch (e) {
    error = true;
    events = [];
    city = '';
    console.error('[eventsAggregator] Error with Groovoo:', e.message);
  }

  // Only reply with Groovoo if we truly have events!
  if (!error && events.length > 0) {
    return { events, fallbackText: null, city };
  }

  // Always fallback to Perplexity if Groovoo failed OR returned 0 events
  let fallbackText = null;
  try {
    const { answer } = await perplexityService.search(message);
    fallbackText = answer && answer.trim() ? answer.trim() : 'Não encontrei eventos para sua busca no momento.';
  } catch (e) {
    fallbackText = 'Não consegui buscar eventos agora. Tente novamente mais tarde!';
    console.error('[eventsAggregator] Perplexity fallback error:', e.message);
  }

  // Always return *something*
  return { events: [], fallbackText, city };
}

module.exports = { aggregateEvents };