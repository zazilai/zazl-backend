// helpers/groovoo.js
const axios = require('axios');

const API_URL = 'https://api.groovoo.app/events/search';

// Common noise patterns to strip
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
  // Remove common noise patterns
  NOISE.forEach(rgx => { lower = lower.replace(rgx, ''); });
  // Now match "em <city>"
  const match = lower.match(/em\s+([a-zãéíóúç\s]+)/i);
  if (match) {
    return match[1].trim();
  }
  // fallback: grab last word if message ends with a city name
  const words = lower.split(' ');
  return words.length > 1 ? words[words.length - 1] : '';
}

async function getEvents(userMessage) {
  try {
    console.log('[groovoo.js] getEvents() triggered with:', userMessage);

    const city = extractCity(userMessage);
    console.log('[groovoo.js] Detected city in message:', city);

    const params = {
      status: 1,
      city: city || undefined,
      payed: true,
      per_page: 10
    };

    console.log('[groovoo.js] Querying Groovoo API with params:', params);

    const res = await axios.get(API_URL, { params });
    const data = res.data?.data || [];

    console.log(`[groovoo.js] Received ${data.length} events from Groovoo API.`);

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