// helpers/groovoo.js
const axios = require('axios');

// Helper: extract city from the message
function extractCity(msg) {
  const match = msg.match(/\bem ([a-z\s]+)[\?\.!]?/i);
  return match && match[1] ? match[1].trim() : '';
}

// Main function to fetch events
async function getEvents(message) {
  let city = extractCity(message);
  let allEvents = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) throw new Error('Invalid Groovoo data');
    allEvents = data;
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    return { events: [], error: true };
  }

  // Filter by city if present
  let filtered = allEvents;
  if (city) {
    const cityLc = city.toLowerCase();
    filtered = allEvents.filter(evt =>
      (evt.address && (
        (evt.address.city && evt.address.city.toLowerCase().includes(cityLc)) ||
        (evt.address.local_name && evt.address.local_name.toLowerCase().includes(cityLc))
      )) ||
      (evt.name && evt.name.toLowerCase().includes(cityLc))
    );
  }

  // Sort soonest first
  filtered = filtered.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  // Limit to top 10
  return { events: filtered.slice(0, 10), error: false };
}

module.exports = { getEvents };