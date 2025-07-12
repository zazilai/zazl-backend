// helpers/partners/eventsDica.js — With More Partners for Accuracy (July 2025)

const axios = require('axios');
const cheerio = require('cheerio'); // For HTML parsing (npm install cheerio if needed)
const ticketmaster = require('../ticketmaster'); // Your existing Ticketmaster helper

// Normalize city
function normalizeCity(city = '') {
  if (!city) return '';
  return city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatEvent(evt) {
  const name = evt.name || 'Evento';
  const city = evt.address?.city || evt.city || '';
  const dateIso = evt.start_at || evt.start_time || evt.date || '';
  const date = dateIso ? (function() {
    try {
      const d = new Date(dateIso);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  })() : '';
  const location = evt.address?.local_name || evt.address?.address || evt.location || evt.venue || '';
  const link = evt.external_shop_url || evt.instagram_link || evt.facebook_link || evt.url || '';
  let line = `🗓️ *${name}*`;
  if (city) line += `\n📍 ${city}`;
  if (location) line += `\n🏟️ ${location}`;
  if (date) line += `\n🕒 ${date}`;
  if (link) line += `\n🎟️ Ingressos: ${link}`;
  return line;
}

// Groovoo API call
async function getGroovooEvents(city) {
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 5000 });
    let events = Array.isArray(res.data) ? res.data : [];
    if (events.length && city) {
      const normCity = normalizeCity(city);
      events = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    }
    return events;
  } catch (e) {
    console.error('[Groovoo] Error:', e);
    return [];
  }
}

// Ticketmaster fallback
async function getTicketmasterEvents(city) {
  try {
    return await ticketmaster.getEvents(city);
  } catch (e) {
    console.error('[Ticketmaster] Error:', e);
    return [];
  }
}

// Fallback: Meetup search (public scrape, no key needed)
async function getMeetupEvents(city) {
  try {
    const res = await axios.get(`https://www.meetup.com/find/events/?keywords=brazilian&location=us--${normalizeCity(city)}`, { timeout: 5000 });
    const $ = cheerio.load(res.data);
    const events = [];
    $('[data-testid="event-card"]').each((i, elem) => {
      if (i >= 3) return false; // Top 3
      const name = $(elem).find('[data-testid="event-card-name"]').text().trim() || 'Evento';
      const url = $(elem).find('a').attr('href') || '';
      const date = $(elem).find('[data-testid="event-card-date"]').text().trim() || '';
      const location = $(elem).find('[data-testid="event-card-location"]').text().trim() || '';
      if (name) events.push({ name, date, location, url: `https://www.meetup.com${url}` });
    });
    return events;
  } catch (e) {
    console.error('[Meetup] Error:', e);
    return [];
  }
}

// Fallback: Floripa Productions (scrape site)
async function getFloripaEvents(city) {
  try {
    const res = await axios.get('https://brazilianfestival.org/events', { timeout: 5000 });
    const $ = cheerio.load(res.data);
    const events = [];
    $('.event-item').each((i, elem) => { // Adjust selector based on actual site HTML
      if (i >= 3) return false; // Top 3
      const name = $(elem).find('.event-title').text().trim() || 'Evento';
      const date = $(elem).find('.event-date').text().trim() || '';
      const location = $(elem).find('.event-location').text().trim() || '';
      const url = $(elem).find('a.more-info').attr('href') || '';
      if (normalizeCity(location).includes(normalizeCity(city))) {
        events.push({ name, date, location, url });
      }
    });
    return events;
  } catch (e) {
    console.error('[Floripa] Error:', e);
    return [];
  }
}

// Main with fallbacks
module.exports = async function eventsDica(message, userCity, userContext, intent) {
  // Only fire for event/agenda/show queries
  if (
    intent !== 'EVENT' &&
    !/\b(evento|agenda|show|balada|festa|programa|o que fazer)\b/i.test(message)
  ) return '';

  let city = userCity;
  if (!city && userContext) {
    const match = userContext.match(/moro em ([\w\s]+)/i);
    if (match) city = match[1].trim();
  }

  let events = await getGroovooEvents(city);

  if (!events.length) {
    events = await getTicketmasterEvents(city);
  }

  if (!events.length) {
    events = await getMeetupEvents(city);
  }

  if (!events.length) {
    events = await getFloripaEvents(city);
  }

  if (!events.length) return '';

  // Filter/sort top 3
  let foundEvents = events
    .filter(evt => !!evt.start_at || !!evt.date)
    .sort((a, b) => new Date(a.start_at || a.date) - new Date(b.start_at || b.date))
    .slice(0, 3);

  let dicaBlock =
    `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*\n` +
    foundEvents.map(formatEvent).join('\n\n') +
    `\n\nDica: Chegue cedo para garantir seu lugar, convide amigos, e confira sempre o link oficial antes de comprar ingressos!`;

  return dicaBlock.trim();
};