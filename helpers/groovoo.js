// helpers/groovoo.js
const axios = require('axios');

const API_URL = 'https://api.groovoo.io/ticketing_events';

// Função para normalizar strings (remove acentos, lowercase)
function normalize(str) {
  return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';
}

function extractCity(userMessage) {
  const match = userMessage.toLowerCase().match(/em\s+([a-zãéíóúç\s]+)/i);
  return match ? normalize(match[1]) : '';
}

async function getEvents(userMessage) {
  try {
    const city = extractCity(userMessage);
    const res = await axios.get(API_URL, { headers: { 'Accept': 'application/json' } });
    const events = Array.isArray(res.data) ? res.data : res.data.data || [];

    // Filtra eventos futuros, status 1, payed true
    let filtered = events.filter(evt =>
      evt.status === 1 &&
      evt.payed === true &&
      new Date(evt.start_at) > new Date()
    );

    // Se cidade informada, filtra por cidade normalizada
    if (city) {
      filtered = filtered.filter(evt =>
        evt.address &&
        normalize(evt.address.city).includes(city)
      );
    }

    // Ordena e limita
    filtered = filtered.sort(
      (a, b) => new Date(a.start_at) - new Date(b.start_at)
    ).slice(0, 6);

    // Retorna eventos formatados
    return filtered.map(evt => ({
      name: evt.name,
      start_time: new Date(evt.start_at).toLocaleString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: evt.timezone || 'America/New_York'
      }),
      location: evt.address?.local_name ||
                (evt.address?.city ? `${evt.address.city}, ${evt.address.state || ''}`.trim() : ''),
      url: evt.external_shop_url || evt.voucher || `https://www.groovooapp.com/events/${evt.alias}`,
      image: evt.images?.[0]?.url_image || ''
    }));
  } catch (err) {
    if (err.response) {
      console.error('[groovoo.js] Error response:', err.response.status, err.response.data);
    } else {
      console.error('[groovoo.js] Error fetching events:', err.message);
    }
    return [];
  }
}

module.exports = { getEvents };