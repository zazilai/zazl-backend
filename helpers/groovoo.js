// helpers/groovoo.js
const axios = require('axios');

const API_URL = 'https://api.groovoo.io/ticketing_events';

// Normalize/strip accents from city names for consistency
function normalizeCity(city) {
  return city ? city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() : '';
}

const NOISE = [
  /algum evento (brasileiro|de brasileiro|de festa|de samba|br)/i,
  /evento( brasileiro)?/i,
  /festa( brasileira)?/i,
  /show(s)?( brasileiro)?/i,
  /tem/i,
  /algum/i,
  /brasileiro/i
];

function extractCity(userMessage) {
  let lower = userMessage.toLowerCase();
  NOISE.forEach(rgx => { lower = lower.replace(rgx, ''); });
  const match = lower.match(/em\s+([a-zãéíóúç\s]+)/i);
  if (match) {
    return normalizeCity(match[1]);
  }
  // fallback: last word
  const words = lower.trim().split(' ');
  return normalizeCity(words.length > 1 ? words[words.length - 1] : '');
}

async function getEvents(userMessage) {
  try {
    console.log('[groovoo.js] getEvents() triggered with:', userMessage);
    let city = extractCity(userMessage);
    if (!city) {
      city = ''; // Optionally, set a default city or search all
    }

    const params = {
      status: 1,
      city: city || undefined,
      payed: true,
      per_page: 10
    };

    console.log('[groovoo.js] Querying Groovoo API with params:', params);

    const res = await axios.get(API_URL, { params });
    const data = res.data?.data || [];

    console.log(`[groovoo.js] Received ${data.length} events from Groovoo API.`, data);

    return data.map(evt => ({
      name: evt.name,
      start_time: evt.start_at?.slice(0, 10),
      location: evt.city || evt.venue || '',
      url: evt.voucher?.includes('groovoo') ? evt.voucher.split(' ').pop() : evt.voucher || ''
    }));
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    return [];
  }
}

module.exports = { getEvents };