// services/groovoo.js
const axios = require('axios');

module.exports = {
  /**
   * Fetch upcoming events from Groovoo,
   * filter out past dates, and normalize shape.
   */
  getEvents: async (userInput = '') => {
    // 1. Hit the Groovoo API
    const { data: events } = await axios.get(
      'https://api.groovoo.io/ticketing_events'
    );

    const now = new Date();

    // 2. Keep only events in the future…
    const upcoming = events.filter(e => {
      if (!e.start_at) return false;
      return new Date(e.start_at) >= now;
    });

    // 3. Map into the shape your reply helper expects:
    return upcoming.map(e => ({
      name: e.name || 'Evento sem nome',
      city: e.address?.city || 'Local não informado',
      date: e.start_at,                 // ISO string, your reply.js will format it
      url: e.voucher || e.external_shop_url || ''  // purchase link if any
    }));
  }
};
