// helpers/ticketmaster.js
const axios = require('axios');
const TM_API_KEY = process.env.TICKETMASTER_API_KEY;

function normalizeCity(city) {
  return city ? city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';
}

// Optionally, list some common keywords to filter Brazilian events
const BRAZILIAN_KEYWORDS = [
  'brasil', 'brazil', 'samba', 'pagode', 'forró', 'axe', 'sertanejo', 'caipirinha', 'carnaval', 'palmeiras', 'corinthians'
];

function isBrazilianEvent(evt) {
  const fields = [
    evt.name, 
    evt.info, 
    evt.description, 
    (evt.classifications && evt.classifications[0]?.genre?.name)
  ].join(' ').toLowerCase();
  return BRAZILIAN_KEYWORDS.some(word => fields.includes(word));
}

async function getEvents(city) {
  if (!TM_API_KEY) return [];
  try {
    const normCity = normalizeCity(city);
    const params = {
      apikey: TM_API_KEY,
      city: normCity,
      countryCode: 'US',
      size: 10,
      sort: 'date,asc'
    };
    const res = await axios.get('https://app.ticketmaster.com/discovery/v2/events.json', { params });
    const data = res.data._embedded?.events || [];

    // Filter only Brazilian-relevant events
    const filtered = data.filter(isBrazilianEvent);

    console.log(`[ticketmaster] Found ${filtered.length} Brazilian events in ${normCity}.`);
    return filtered.map(evt => ({
      name: evt.name,
      start_time: evt.dates.start.localDate,
      location: evt._embedded?.venues?.[0]?.name || '',
      url: evt.url
    }));
  } catch (err) {
    console.error('[Ticketmaster] Error:', err.message);
    return [];
  }
}

module.exports = { getEvents };