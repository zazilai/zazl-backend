// helpers/ticketmaster.js

const axios = require('axios');
const TM_API_KEY = process.env.TICKETMASTER_API_KEY; // set on Render

async function getEvents(city) {
  if (!TM_API_KEY) return [];
  try {
    const params = {
      apikey: TM_API_KEY,
      city,
      countryCode: 'US',
      size: 5,
      sort: 'date,asc'
    };
    const res = await axios.get('https://app.ticketmaster.com/discovery/v2/events.json', { params });
    const data = res.data._embedded?.events || [];
    return data.map(evt => ({
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