// helpers/groovoo.js
const axios = require('axios');

const API_URL = 'https://api.groovoo.app/events/search';

async function getEvents(userMessage) {
  try {
    console.log('[groovoo.js] getEvents() triggered with:', userMessage);

    let city = '';
    const lower = userMessage.toLowerCase();

    const match = lower.match(/em ([a-zãéíóúç\s]+)/i);
    if (match) {
      city = match[1].trim();
      console.log('[groovoo.js] Detected city in message:', city);
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

    console.log(`[groovoo.js] Received ${data.length} events from Groovoo API.`);

    return data.map(evt => ({
      name: evt.name,
      start_time: evt.start_at?.slice(0, 10),
      location: evt.city || evt.venue || '',
      url: evt.voucher?.includes('groovoo') ? evt.voucher.split(' ')[evt.voucher.split(' ').length - 1] : evt.voucher || ''
    }));
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    return [];
  }
}

module.exports = { getEvents };