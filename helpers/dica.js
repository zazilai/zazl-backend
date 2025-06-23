// helpers/dica.js

const amazon = require('./amazon');
const groovoo = require('./groovoo');

/**
 * Returns a “Dica do Zazil” string for Marketplace/Partners.
 * - Always additive, never replaces the main Perplexity/GPT answer.
 * - Safe: if partner fails, just returns '' and main answer is shown.
 */
async function getDica({ intent, message, city }) {
  // AMAZON/Product
  if (intent === 'AMAZON') {
    try {
      const items = await amazon.searchAmazonProducts(message);
      if (items && items.length && items[0].url && items[0].title) {
        return `Encontrei um produto recomendado na Amazon: [${items[0].title}](${items[0].url}) — sempre confira as avaliações antes de comprar!`;
      }
    } catch (err) {
      console.error('[dica.js] Amazon error:', err);
    }
    return '';
  }

  // Currency/FX
  if (intent === 'FX') {
    return 'Precisa enviar dinheiro pro Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp';
  }

  // Events — Groovoo integration
  if (intent === 'EVENT') {
    try {
      const { events } = await groovoo.getEvents(message);
      if (events && events.length) {
        const e = events[0];
        // Choose the best available event link
        const eventUrl = e.buy_link || e.external_shop_url || e.url || e.facebook_link || e.instagram_link || '';
        const cityText = (e.address && e.address.city) ? e.address.city : (city || '');
        let dica = `Encontrei um evento bem legal: *${e.name}*`;
        if (cityText) dica += ` em ${cityText}`;
        if (eventUrl) dica += `, [ver ingressos aqui](${eventUrl})`;
        dica += '.';
        return dica;
      }
    } catch (err) {
      console.error('[dica.js] Error fetching Groovoo events:', err);
    }
    return '';
  }

  // Add more marketplace/partner integrations here as you grow!

  // Default: no dica for this intent
  return '';
}

module.exports = { getDica };