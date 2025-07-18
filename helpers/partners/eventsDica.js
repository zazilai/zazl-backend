// helpers/partners/eventsDica.js — Updated with Ticketmaster Support (July 2025)
// To use Ticketmaster, sign up at https://developer.ticketmaster.com/ and add TICKETMASTER_API_KEY to your .env file

const axios = require('axios');
const cheerio = require('cheerio');
const perplexityService = require('../perplexity');

// Ticketmaster integration
const ticketmaster = {
  async getEvents(city) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      console.warn('[Ticketmaster] Missing API_KEY');
      return [];
    }
    try {
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&city=${encodeURIComponent(city)}&keyword=brazilian&sort=date,asc&size=5`;
      const res = await axios.get(url, { timeout: 5000 });
      if (!res.data._embedded?.events) return [];
      return res.data._embedded.events.map(event => ({
        name: event.name,
        start_at: event.dates?.start?.dateTime,
        address: {
          city: event._embedded?.venues?.[0]?.city?.name,
          local_name: event._embedded?.venues?.[0]?.name,
          address: event._embedded?.venues?.[0]?.address?.line1
        },
        external_shop_url: event.url
      }));
    } catch (e) {
      console.error('[Ticketmaster] Fetch error:', e.message);
      return [];
    }
  }
};

// Normalize city name
function normalizeCity(city = '') {
  return city.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Format output
function formatEvent(evt) {
  const name = evt.name || 'Evento';
  const city = evt.address?.city || evt.city || '';
  const dateIso = evt.start_at || evt.start_time || evt.date || '';
  const date = dateIso ? (() => {
    try {
      const d = new Date(dateIso);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return ''; }
  })() : '';
  const location = evt.address?.local_name || evt.address?.address || evt.location || evt.venue || '';
  const link = evt.external_shop_url || evt.instagram_link || evt.facebook_link || evt.url || '';
  let out = `🗓️ *${name}*`;
  if (city) out += `\n📍 ${city}`;
  if (location) out += `\n🏟️ ${location}`;
  if (date) out += `\n🕒 ${date}`;
  if (link) out += `\n🎟️ Ingressos: ${link}`;
  return out;
}

// Groovoo
async function getGroovooEvents(city) {
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 5000 });
    let events = Array.isArray(res.data) ? res.data : [];
    if (city) {
      const normCity = normalizeCity(city);
      events = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    }
    return events;
  } catch (e) {
    console.error('[Groovoo] Error:', e.message);
    return [];
  }
}

// Meetup
async function getMeetupEvents(city) {
  try {
    const url = `https://www.meetup.com/find/events/?keywords=brazilian&location=us--${normalizeCity(city)}`;
    const res = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(res.data);
    const events = [];
    $('[data-testid="event-card"]').each((i, el) => {
      if (i >= 3) return false;
      const name = $(el).find('[data-testid="event-card-name"]').text().trim();
      const date = $(el).find('[data-testid="event-card-date"]').text().trim();
      const location = $(el).find('[data-testid="event-card-location"]').text().trim();
      const href = $(el).find('a').attr('href');
      if (name) events.push({ name, date, location, url: `https://www.meetup.com${href}` });
    });
    return events;
  } catch (e) {
    console.error('[Meetup] Error:', e.message);
    return [];
  }
}

// Floripa Festival
async function getFloripaEvents(city) {
  try {
    const res = await axios.get('https://brazilianfestival.org/events', { timeout: 5000 });
    const $ = cheerio.load(res.data);
    const events = [];
    $('.event-item').each((i, el) => {
      if (i >= 3) return false;
      const name = $(el).find('.event-title').text().trim();
      const date = $(el).find('.event-date').text().trim();
      const location = $(el).find('.event-location').text().trim();
      const url = $(el).find('a.more-info').attr('href');
      if (normalizeCity(location).includes(normalizeCity(city))) {
        events.push({ name, date, location, url });
      }
    });
    return events;
  } catch (e) {
    console.error('[Floripa] Error:', e.message);
    return [];
  }
}

// Main entry
module.exports = async function eventsDica(message, userCity, userContext, intent) {
  if (intent !== 'EVENT' && !/\b(evento|agenda|show|balada|festa|programa|o que fazer)\b/i.test(message)) return '';

  let city = userCity;
  if (!city && userContext) {
    const match = userContext.match(/moro em ([\w\s]+)/i);
    if (match) city = match[1].trim();
  }
  if (!city) return 'Dica do Zazil: Me diga sua cidade para eventos personalizados!';

  let events = await getGroovooEvents(city);
  if (!events.length) events = await ticketmaster.getEvents(city);
  if (!events.length) events = await getMeetupEvents(city);
  if (!events.length) events = await getFloripaEvents(city);

  if (!events.length) {
    const { answer } = await perplexityService.search(`Current Brazilian events in ${city} July 2025`);
    return answer ? `Dica do Zazil: ${answer}` : `Não achei eventos em ${city}. Tente buscar no Meetup ou grupos locais!`;
  }

  const sorted = events
    .filter(e => e.start_at || e.start_time || e.date)
    .sort((a, b) => new Date(a.start_at || a.start_time || a.date) - new Date(b.start_at || b.start_time || b.date))
    .slice(0, 3);

  return `💡 *Dica do Zazil – Eventos em ${city}*\n` +
    sorted.map(formatEvent).join('\n\n') +
    '\n\nDica: Convide amigos e chegue cedo!';
};