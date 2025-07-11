// helpers/partners/eventsDica.js — With Fallbacks for Reliability (July 2025)

const axios = require('axios');
const ticketmaster = require('../ticketmaster');

// Groovoo call (existing)
async function getGroovooEvents() {
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 3000 });
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    console.error('[Groovoo] Error:', e);
    return [];
  }
}

// Main with fallbacks
module.exports = async function eventsDica(message, userCity, userContext, intent) {
  if (intent !== 'EVENT' && !/\b(evento|agenda|show|balada|festa|programa|o que fazer)\b/i.test(message)) return '';

  let city = userCity || ''; // Extract logic if needed

  let events = await getGroovooEvents();
  if (!events.length) events = await ticketmaster.getEvents(city);
  if (!events.length) events = await getEventbriteEvents('brazilian events', city); // From marketplaceDica

  if (!events.length) return '';

  // Filter/sort (existing logic)
  // ... (keep your normalize/format)

  let dicaBlock = `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*\n` + /* formatted events */ + `\n\nDica: Confirme no link oficial!`;

  return dicaBlock.trim();
};