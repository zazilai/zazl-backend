// helpers/partners/eventsDica.js
const axios = require('axios');

// Normalize/canonicalize a city name
function normalizeCity(city = '') {
  if (!city) return '';
  return city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Format a single event for WhatsApp
function formatEvent(evt) {
  const name = evt.name || 'Evento';
  const city = evt.address?.city || '';
  const dateIso = evt.start_at;
  const date = dateIso
    ? (() => {
        try {
          const d = new Date(dateIso);
          return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          return '';
        }
      })()
    : '';
  const location = evt.address?.local_name || evt.address?.address || '';
  const link = evt.external_shop_url || evt.instagram_link || evt.facebook_link || '';
  let line = `🗓️ *${name}*`;
  if (city) line += `\n📍 ${city}`;
  if (location) line += `\n🏟️ ${location}`;
  if (date) line += `\n🕒 ${date}`;
  if (link) line += `\n🎟️ Ingressos: ${link}`;
  return line;
}

/**
 * Returns a WhatsApp-formatted Dica block for up to 3 events.
 * @param {string} userMessage
 * @param {string} userCity
 * @param {string} userContext
 * @param {string} intent
 * @returns {Promise<string>}
 */
module.exports = async function eventsDica(userMessage, userCity, userContext, intent) {
  // Only answer for GENERIC, EVENT, NEWS, or if question is "current"
  if (intent && !['EVENT', 'GENERIC', 'NEWS'].includes(intent)) return '';

  let city = userCity;
  // Try to extract a city from context if not present
  if (!city && userContext) {
    const match = userContext.match(/moro em ([\w\s]+)/i);
    if (match) city = match[1].trim();
  }

  // Call Groovoo API
  let events = [];
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 3000 });
    if (Array.isArray(res.data)) events = res.data;
  } catch (e) {
    console.error('[eventsDica] Groovoo API error:', e);
    return ''; // Fail silently
  }
  if (!events.length) return '';

  // Filter by city (if any)
  let foundEvents = [];
  if (city) {
    const normCity = normalizeCity(city);
    foundEvents = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    if (foundEvents.length < 1) foundEvents = events;
  } else {
    foundEvents = events;
  }

  // Sort by start date, only upcoming, top 3
  foundEvents = foundEvents
    .filter(evt => !!evt.start_at)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 3);

  if (!foundEvents.length) return '';

  let dicaBlock =
    `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*\n` +
    foundEvents.map(formatEvent).join('\n\n') +
    `\n\nDica: Chegue cedo, convide amigos e confira sempre o link oficial antes de comprar ingressos!`;

  return dicaBlock.trim();
};