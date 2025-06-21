// helpers/groovoo.js
const axios = require('axios');

// Helper: extract city from message (simple match after "em")
function extractCity(msg) {
  const match = msg.match(/\bem ([a-z\s]+)[\?\.!]?/i);
  if (match && match[1]) return match[1].trim();
  return '';
}

// Main: fetch events, filter by city if possible
async function getEvents(messageOrCity) {
  let city = typeof messageOrCity === 'string' ? extractCity(messageOrCity) : '';
  let allEvents = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    allEvents = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    return []; // Always return array, never null or error obj
  }
  // Filter events by city if present
  if (city) {
    const cityLc = city.toLowerCase();
    allEvents = allEvents.filter(evt =>
      (evt.address && (
        (evt.address.city && evt.address.city.toLowerCase().includes(cityLc)) ||
        (evt.address.local_name && evt.address.local_name.toLowerCase().includes(cityLc))
      )) ||
      (evt.name && evt.name.toLowerCase().includes(cityLc))
    );
  }
  // Sort soonest first, limit 10
  return allEvents
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 10);
}

module.exports = { getEvents };