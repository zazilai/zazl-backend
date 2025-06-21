// helpers/dica.js

const amazon = require('./amazon');
const groovoo = require('./groovoo');

/**
 * Returns a marketplace “Dica do Zazil” string based on intent.
 * For EVENT: surfaces the first Groovoo event in user's city (if any).
 * For AMAZON: recommends top product (already working).
 * For FX: shows Remitly.
 * You can expand this with more partners/services as you grow.
 */
async function getDica({ intent, message, city }) {
  if (intent === 'AMAZON') {
    // Show the top Amazon product as a tip
    const items = await amazon.searchAmazonProducts(message);
    if (items && items.length && items[0].url) {
      return `Veja este produto recomendado na Amazon: [${items[0].title}](${items[0].url})`;
    }
  }

  if (intent === 'FX') {
    return 'Se precisar enviar dinheiro para o Brasil, use a Remitly: https://remit.ly/1bh2ujzp';
  }

  if (intent === 'EVENT') {
    // Try to fetch a Groovoo event for the city
    let queryCity = city || '';
    // If user message already mentions a city, let Groovoo handle
    let searchMsg = queryCity ? `eventos em ${queryCity}` : message;

    try {
      const { events } = await groovoo.getEvents(searchMsg);
      if (events && events.length) {
        const e = events[0];
        // Construct event Dica
        return `Evento parceiro Groovoo: *${e.name}* em ${e.address?.city || queryCity}, [Ingressos aqui](${e.url || e.facebook || ''})`;
      }
      // No events found for city — fallback
      return 'Não encontrei eventos parceiros do Groovoo nessa cidade no momento, mas fique ligado para novidades!';
    } catch (err) {
      console.error('[dica.js] Error fetching Groovoo events:', err);
      return '';
    }
  }

  // Expand for more intent/partner combos as you grow
  return '';
}

module.exports = { getDica };