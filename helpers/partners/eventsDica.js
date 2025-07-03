// helpers/partners/eventsDica.js

const axios = require('axios');

// Utility to clean and normalize a city string
function normalizeCity(city = '') {
  if (!city) return '';
  return city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Utility to format the event as WhatsApp-friendly
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

module.exports = async function eventsDica(userMessage, userCity, userContext) {
  let city = userCity;
  // Try to extract a city from the message/context if not present
  if (!city && userContext) {
    const match = userContext.match(/moro em ([\w\s]+)/i);
    if (match) city = match[1].trim();
  }

  // Call the Groovoo API
  let events = [];
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 3000 });
    if (Array.isArray(res.data)) events = res.data;
  } catch (e) {
    console.error('[eventsDica] Groovoo API error:', e);
    return ''; // Fail silently
  }

  if (!events.length) return '';

  // Try to filter by city if we have one
  let foundEvents = [];
  if (city) {
    const normCity = normalizeCity(city);
    foundEvents = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    // If not enough events, show general US events
    if (foundEvents.length < 1) {
      foundEvents = events;
    }
  } else {
    foundEvents = events;
  }

  // Sort by start date, upcoming first
  foundEvents = foundEvents
    .filter(evt => !!evt.start_at)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 3);

  if (!foundEvents.length) return '';

  // Build the message block
  let dicaBlock =
    `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*\n` +
    foundEvents.map(formatEvent).join('\n\n') +
    `\n\nDica: Chegue cedo para garantir seu lugar, convide amigos, e confira sempre o link oficial antes de comprar ingressos!`;

  return dicaBlock.trim();
};