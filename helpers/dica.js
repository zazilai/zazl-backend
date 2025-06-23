// helpers/dica.js
const amazon = require('./amazon');
const groovoo = require('./groovoo');

/**
 * Returns a “Dica do Zazil” string for Marketplace:
 * - AMAZON: always US Amazon, safe fallback.
 * - FX: Remitly as the default.
 * - EVENT: always Groovoo’s first event (with link), or soft fallback.
 * - Extendable to new partners/intents.
 */
async function getDica({ intent, message, city }) {
  try {
    // 1. Amazon/Product (ALWAYS return US Amazon link, clean tip)
    if (intent === 'AMAZON') {
      const items = await amazon.searchAmazonProducts(message);
      if (items && items.length && items[0].url && items[0].title) {
        return `Encontrei um produto recomendado nos EUA: [${items[0].title}](${items[0].url}) — sempre confira as avaliações antes de comprar!`;
      }
      // If fallback (e.g. Perplexity answer or API down)
      if (items && items[0] && items[0].answer) {
        return `Não achei produtos na Amazon agora, mas aqui vai uma dica extra:\n\n${items[0].answer}`;
      }
      return '';
    }

    // 2. Currency/FX
    if (intent === 'FX') {
      return 'Precisa enviar dinheiro pro Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp';
    }

    // 3. Events — Groovoo
    if (intent === 'EVENT') {
      // Always search with both city and message context
      let searchCity = city && typeof city === 'string' ? city.trim() : '';
      let searchMsg = searchCity ? `eventos em ${searchCity}` : message;
      const { events } = await groovoo.getEvents(searchMsg);
      if (events && events.length) {
        const e = events[0];
        // Support all possible event URL fields
        const eventUrl =
          e.external_shop_url ||
          e.buy_link ||
          e.url ||
          e.facebook_link ||
          e.instagram_link ||
          '';
        const cityText = (e.address && (e.address.city || e.address.local_name)) || searchCity || '';
        let dica = `Encontrei um evento bem legal: *${e.name}*`;
        if (cityText) dica += ` em ${cityText}`;
        if (eventUrl) dica += `, [ver ingressos aqui](${eventUrl})`;
        dica += '.';
        return dica;
      }
      // Soft fallback
      return 'Ainda não temos eventos parceiros Groovoo nesta cidade, mas fique de olho nas novidades!';
    }

    // 4. Add new partners/intents here as needed

    // Default: nothing found
    return '';
  } catch (err) {
    // Failsafe: Always log and never break user flow!
    console.error('[dica.js] Error fetching partner dica:', err);
    return '';
  }
}

module.exports = { getDica };