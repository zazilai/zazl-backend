// helpers/groovoo.js

const axios = require('axios');

/**
 * Returns up to 3 formatted Groovoo event strings for a city, for use in "Dica do Zazil".
 * If no city is provided, returns up to 3 soonest events overall.
 * If nothing is found or fetch fails, returns ''.
 */
async function getGroovooDica(city = '') {
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) return '';

    const cityLc = (city || '').trim().toLowerCase();
    const filtered = cityLc
      ? data.filter(evt =>
          (evt.address?.city && evt.address.city.toLowerCase().includes(cityLc)) ||
          (evt.address?.local_name && evt.address.local_name.toLowerCase().includes(cityLc)) ||
          (evt.name && evt.name.toLowerCase().includes(cityLc))
        )
      : data;

    if (!filtered.length) return '';

    return filtered.slice(0, 3).map(evt => {
      const name = evt.name || '';
      const date = evt.start_at
        ? new Date(evt.start_at).toLocaleString('pt-BR', { timeZone: 'America/New_York' })
        : '';
      const location = evt.address?.local_name || evt.address?.city || '';
      const url = evt.url || '';
      return `🗓️ *${name}*\n📍 ${location}\n🗓️ ${date}\n🔗 [Ingressos](${url})`;
    }).join('\n\n');
  } catch (err) {
    console.error('[Groovoo Dica] fetch failed:', err.message);
    return '';
  }
}

module.exports = { getGroovooDica };