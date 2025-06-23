// helpers/dica.js

const amazon = require('./amazon');
const groovoo = require('./groovoo');

/**
 * Returns a “Dica do Zazil” string for Marketplace.
 * - For AMAZON: shows a top recommended product (if found).
 * - For FX: always promotes Remitly for money transfer.
 * - For EVENT: offers a top Groovoo event, or a friendly fallback.
 * - Expand with more partners/intents as you scale!
 */
async function getDica({ intent, message, city }) {
  // 1. Amazon/Product
  if (intent === 'AMAZON') {
    const items = await amazon.searchAmazonProducts(message);
    if (items && items.length && items[0].url && items[0].title) {
      return `Encontrei um produto recomendado na Amazon: [${items[0].title}](${items[0].url}) — sempre confira as avaliações antes de comprar!`;
    }
    // If no items, no dica (let generic Dica from reply.js do the job)
    return '';
  }

  // 2. Currency/FX
  if (intent === 'FX') {
    return 'Precisa enviar dinheiro pro Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp';
  }

  // 3. Events — Groovoo integration
  if (intent === 'EVENT') {
    let searchCity = city && typeof city === 'string' ? city.trim() : '';
    let searchMsg = searchCity ? `eventos em ${searchCity}` : message;
    try {
      const { events } = await groovoo.getEvents(searchMsg);
      if (events && events.length) {
        const e = events[0];
        // Format date/time for Brazil
        const dateObj = new Date(e.start_at);
        const date = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const venue = [e.address?.local_name, e.address?.address].filter(Boolean).join(', ');
        const cityText = e.address?.city || searchCity || '';
        const url = e.external_shop_url || e.url || e.facebook_link || e.instagram_link || '';
        const voucher = e.voucher ? `\n🎟️ Cupom: ${e.voucher}` : '';

        // Friendly, "Zazil" message style:
        return [
          `Encontrei uns bem legais aqui ó:`,
          `*${e.name}*${cityText ? ` em ${cityText}` : ''}`,
          `🗓️ ${date} às ${time}`,
          venue ? `📍 ${venue}` : '',
          url ? `🔗 [Compre ingresso aqui](${url})` : '',
          voucher
        ].filter(Boolean).join('\n');
      }
      // If no events for city
      return 'Ainda não achei eventos parceiros aqui, mas sempre aparecem novidades. Se quiser, me peça de novo mais tarde!';
    } catch (err) {
      console.error('[dica.js] Error fetching Groovoo events:', err);
      return '';
    }
  }

  // 4. Expand for more marketplace partners as you grow!

  // Default: no Dica for this intent (let main reply handle)
  return '';
}

module.exports = { getDica };