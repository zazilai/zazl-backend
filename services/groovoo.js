const axios = require('axios');

/**
 * Fetch upcoming Groovoo events (Brazil-related, US-based).
 * Returns an array of simplified event objects:
 *   [{ id, name, date, city, url }]
 */
exports.getEvents = async (query = '') => {
  // 1 Fetch the raw list
  const { data } = await axios.get('https://api.groovoo.io/ticketing_events');

  // 2 Filter: future events only, optional text search
  const now = Date.now();
  const upcoming = data.filter(e => {
    const start = new Date(e.start_at).getTime();
    const matchesQuery =
      !query || e.name?.toLowerCase().includes(query.toLowerCase());
    return start >= now && matchesQuery;
  });

  // 3 Sort chronologically and keep the next 5
  upcoming.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  // 4 Map to the fields our reply helper expects
  return upcoming.slice(0, 5).map(e => ({
    id:   e.id,
    name: e.name || 'Evento sem nome',
    date: e.start_at,
    city: e.address?.city || 'Local não informado',
    url:  e.external_shop_url || e.voucher || ''
  }));
};
