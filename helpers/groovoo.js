// helpers/groovoo.js
const axios = require('axios');

function normalize(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractCity(msg) {
  const match = msg.match(/\bem\s+([a-zA-Z\s]+)/i);
  if (match && match[1]) {
    return normalize(match[1]);
  }
  return '';
}

async function getEvents(message) {
  const searchCity = extractCity(message);
  console.log('[Groovoo] Search city extracted:', searchCity);

  let events = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) throw new Error('Groovoo API: Unexpected response');
    events = data;
  } catch (err) {
    console.error('[Groovoo] API error:', err.message);
    return { events: [], error: true };
  }

  // DEBUG: Log all cities for first 10 events
  console.log('[Groovoo] First 10 event cities:', events.slice(0, 10).map(e => ({
    city: e.address?.city,
    local_name: e.address?.local_name
  })));

  let filtered = events;
  if (searchCity) {
    filtered = events.filter(e => {
      const eventCity = normalize(e.address?.city);
      const localName = normalize(e.address?.local_name);
      const found = eventCity.includes(searchCity) || localName.includes(searchCity);
      // DEBUG: Log every city checked
      if (found) {
        console.log(`[Groovoo] MATCH: Query [${searchCity}] matched with event city [${eventCity}] or local_name [${localName}]`);
      }
      return found;
    });
  }

  // Sort by soonest
  filtered = filtered.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return { events: filtered.slice(0, 10), error: false };
}

module.exports = { getEvents };