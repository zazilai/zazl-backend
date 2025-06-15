// helpers/groovoo.js

const axios = require('axios');
const GROOVOO_API_URL = process.env.GROOVOO_API_URL || 'https://api.groovoo.com/events';

async function getEvents(message) {
  try {
    // Basic city extraction logic
    const cityMatch = message.match(/\bem ([a-zA-Z\s]+)$/i) || message.match(/em\s+([a-zA-Z\s]+)/i);
    let city = cityMatch ? cityMatch[1].trim() : '';
    if (city) city = city.toLowerCase();

    const params = {
      status: 1,
      payed: true,
      per_page: 10,
    };
    if (city) params.city = city;

    console.log('[groovoo.js] Querying Groovoo API with params:', params);

    const response = await axios.get(GROOVOO_API_URL, { params });
    const events = response.data?.data || [];
    return events;
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    return [];
  }
}

module.exports = {
  getEvents,
};