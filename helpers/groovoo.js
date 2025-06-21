// helpers/groovoo.js
const axios = require('axios');

// Utility: remove accents and normalize for robust city matching
function normalize(text) {
  if (!text) return '';
  return text
    .normalize('NFD') // Normalize to decompose accents
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .toLowerCase()
    .trim();
}

// Extract city from the user's message (looks for "em <city>")
function extractCity(msg) {
  const match = msg.match(/\bem\s+([a-zA-Z\s]+)/i);
  if (match && match[1]) {
    return normalize(match[1]);
  }
  return '';
}

async function getEvents(message) {
  // Try to extract city from the message
  const searchCity = extractCity(message);
  let events = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) throw new Error('Groovoo API: Unexpected response');
    events = data;
  } catch (err) {
    console.error('[Groovoo] API error:', err.message);
    return { events: [], error: true };
  }

  // If city present, filter by city (normalized match, robust to accents/case)
  let filtered = events;
  if (searchCity) {
    filtered = events.filter(e => {
      const eventCity = normalize(e.address?.city);
      const localName = normalize(e.address?.local_name);
      // Match against both address.city and address.local_name
      return eventCity.includes(searchCity) || localName.includes(searchCity);
    });
  }

  // Sort by soonest
  filtered = filtered.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return { events: filtered.slice(0, 10), error: false };
}

module.exports = { getEvents };