// services/groovoo.js
const axios  = require('axios');

let cache   = null;
let expires = 0;
const TTL_MS = 15 * 60 * 1000; // 15 minutes

module.exports.getEvents = async (query = '') => {
  const now = Date.now();
  if (cache && now < expires) return cache;

  const { data: events = [] } =
    await axios.get('https://api.groovoo.io/ticketing_events');

  const upcoming = events
    .filter(e => new Date(e.start_at) > new Date())
    .filter(e => !query || e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 5)
    .map(e => ({
      name : e.name,
      city : e.address?.city || 'Local não informado',
      start: e.start_at,
      link : e.external_shop_url || e.voucher || ''
    }));

  cache   = upcoming;
  expires = now + TTL_MS;
  return upcoming;
};
