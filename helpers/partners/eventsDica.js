// helpers/partners/eventsDica.js

const axios = require('axios');

/**
 * Normalize city names to match more easily.
 */
function normalizeCity(city = '') {
  if (!city) return '';
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[\s\-]+/g, ' ');       // Standardize spaces
}

/**
 * Format a Groovoo event as a WhatsApp-friendly string.
 */
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
 * Main Zazil marketplace Dica for Brazilian events.
 * @param {string} userMessage
 * @param {string} userCity
 * @param {string} userContext
 * @returns {Promise<string[]>} — array of dica blocks, max 3
 */
module.exports = async function eventsDica(userMessage, userCity, userContext) {
  // Try to get city from userCity or context
  let city = userCity;
  if ((!city || city.length < 2) && userContext) {
    const match = userContext.match(/moro em ([\w\s]+)/i);
    if (match) city = match[1].trim();
  }

  // Fetch all Groovoo events
  let events = [];
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 3000 });
    if (Array.isArray(res.data)) events = res.data;
  } catch (e) {
    console.error('[eventsDica] Groovoo API error:', e);
    return [];
  }
  if (!events.length) return [];

  // Filter events by city if possible, otherwise show top upcoming
  let foundEvents = [];
  if (city && city.length > 1) {
    const normCity = normalizeCity(city);
    foundEvents = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    // If not enough, include general US events
    if (foundEvents.length < 1) foundEvents = events;
  } else {
    foundEvents = events;
  }

  // Sort by date (upcoming first), limit to 3
  foundEvents = foundEvents
    .filter(evt => !!evt.start_at)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 3);

  if (!foundEvents.length) return [];

  // WhatsApp block: One message per event, with header only on first
  const dicaBlocks = foundEvents.map((evt, idx) => {
    const header = idx === 0 ? '💡 *Dica do Zazil – Eventos Brasileiros nos EUA*\n' : '';
    return header + formatEvent(evt);
  });

  // Add a closing recommendation (on last only)
  if (dicaBlocks.length) {
    dicaBlocks[dicaBlocks.length - 1] +=
      '\n\nDica: Chegue cedo para garantir seu lugar, convide amigos, e confira sempre o link oficial antes de comprar ingressos!';
  }

  return dicaBlocks;
};