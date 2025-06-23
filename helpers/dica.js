// helpers/dica.js
const amazon = require('./amazon');
const groovoo = require('./groovoo');

/**
 * Returns a “Dica do Zazil” string for Marketplace.
 * - For AMAZON: shows a top recommended product (if found).
 * - For FX: always promotes Remitly for money transfer.
 * - For EVENT: offers a top Groovoo event, or a friendly fallback.
 * - Expand with more partners/intents as you scale!
 * - Always additive—never replaces the main Perplexity/GPT answer.
 */
async function getDica({ intent, message, city }) {
  // 1. Amazon/Product
  if (intent === 'AMAZON') {
    const items = await amazon.searchAmazonProducts(message);
    if (items && items.length && items[0].url && items[0].title) {
      return `Encontrei um produto recomendado na Amazon: [${items[0].title}](${items[0].url}) — sempre confira as avaliações antes de comprar!`;
    }
    // No items = no dica (let generic Dica from reply.js do the job)
    return '';
  }

  // 2. Currency/FX
  if (intent === 'FX') {
    return 'Precisa enviar dinheiro pro Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp';
  }

  // 3. Events — Groovoo integration (ALWAYS additive)
  if (intent === 'EVENT') {
    // Defensive: if city is empty, try to extract from message in Groovoo
    let searchCity = city && typeof city === 'string' ? city.trim() : '';
    let searchMsg = searchCity ? `eventos em ${searchCity}` : message;
    try {
      const { events } = await groovoo.getEvents(searchMsg);
      if (events && events.length) {
        const e = events[0];
        let eventUrl =
          e.buy_link ||
          e.external_shop_url ||
          e.url ||
          e.facebook_link ||
          e.instagram_link ||
          '';
        let cityText = (e.address && e.address.city) ? e.address.city : (searchCity || '');
        let dica = `Encontrei um evento bem legal: *${e.name}*`;
        if (cityText) dica += ` em ${cityText}`;
        if (eventUrl) dica += `, [ver ingressos aqui](${eventUrl})`;
        dica += '.';
        return dica;
      }
      // If no events for city
      return 'Ainda não temos eventos parceiros Groovoo nesta cidade, mas fique de olho nas novidades!';
    } catch (err) {
      console.error('[dica.js] Error fetching Groovoo events:', err);
      return '';
    }
  }

  // Expand for more marketplace partners as you grow!
  return '';
}

module.exports = { getDica };