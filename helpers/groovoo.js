// helpers/groovoo.js

const axios = require('axios');

// Helper: sanitize and extract city from message
function extractCity(msg) {
  // Simple city extraction: match after 'em' or 'em ' (future: use NLP for robustness)
  const match = msg.match(/\bem ([a-z\s]+)[\?\.!]?/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  // If not found, try for common patterns, else return empty
  return '';
}

// Main function: fetch and filter events
async function getEvents(message) {
  let city = extractCity(message);
  let allEvents = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) {
      throw new Error('Invalid Groovoo data');
    }
    allEvents = data;
  } catch (err) {
    console.error('[groovoo.js] Error fetching events:', err.message);
    // Always return empty array + error so aggregator can fallback
    return { events: [], error: true };
  }

  // Filter by city if present (case-insensitive, match on .city or .address.local_name)
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