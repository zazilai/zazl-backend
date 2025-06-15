// helpers/eventsAggregator.js

const groovoo = require('./groovoo');
const perplexityService = require('./perplexity');

/**
 * Aggregates events for Zazil:
 * - Always tries Groovoo first (API for Brazilian events in USA)
 * - If Groovoo fails (network, server) or returns empty, falls back to Perplexity (news/LLM)
 * - Always returns { events: [], fallbackText } where at least one is non-empty
 * - Fallback text is generic but friendly for Zazil context
 * @param {string} message - user query (may include city, type, etc)
 * @returns {Promise<{ events: Array, fallbackText: string|null }>}
 */
async function aggregateEvents(message) {
  // 1. Try Groovoo
  let events = [];
  let error = false;
  try {
    const result = await groovoo.getEvents(message);
    events = result.events || [];
    error = !!result.error;
  } catch (e) {
    error = true;
    events = [];
    console.error('[eventsAggregator] Error with Groovoo:', e.message);
  }

  // 2. If we got good events, return those
  if (!error && Array.isArray(events) && events.length > 0) {
    return { events, fallbackText: null };
  }

  // 3. If Groovoo fails or is empty, fallback to Perplexity (news/LLM)
  let fallbackText = null;
  try {
    const { answer } = await perplexityService.search(message);
    fallbackText = answer && answer.trim() ? answer.trim() : 'Não encontrei eventos para sua busca no momento.';
  } catch (e) {
    fallbackText = 'Não consegui buscar eventos agora. Tente novamente mais tarde!';
    console.error('[eventsAggregator] Perplexity fallback error:', e.message);
  }

  // Always return *something* (either .events or .fallbackText)
  return { events: [], fallbackText };
}

module.exports = { aggregateEvents };