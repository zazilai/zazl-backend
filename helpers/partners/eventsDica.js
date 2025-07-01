// helpers/partners/eventsDica.js

const getEvents = require('../groovoo'); // Should be your API or DB for events

module.exports = async function eventsDica(message, city, context) {
  if (!/evento|show|festa|balada|agenda|o que fazer/i.test(message)) return '';
  try {
    const result = await getEvents(city || '');
    const events = result?.events || [];
    if (!events.length) return '';
    const e = events[0];
    return [
      '💡 Dica do Zazil:',
      `🎉 Evento em destaque: ${e.name}`,
      e.location ? `📍 ${e.location}` : '',
      e.start_at ? `🗓️ ${new Date(e.start_at).toLocaleString('pt-BR')}` : '',
      e.buy_link ? `Ingressos: ${e.buy_link}` : '',
      'Dica: Chegue cedo para garantir seu lugar!'
    ].filter(Boolean).join('\n');
  } catch (e) {
    return '';
  }
};