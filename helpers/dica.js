// helpers/dica.js

const amazon = require('./amazon');
const groovoo = require('./groovoo');
const replyHelper = require('./reply');
const extractCityFromText = require('./utils/extractCityFromText');

/**
 * Returns a “Dica do Zazil” string for Marketplace/Partners.
 * Always additive, never replaces main Perplexity/GPT answer.
 */
async function getDica({ intent, message, city, memory = '' }) {
  // Smart city extraction/fallback
  let searchCity = '';
  try {
    searchCity = await extractCityFromText(message);
  } catch (e) {
    console.error('[dica.js] Error extracting city:', e);
    searchCity = '';
  }
  if (!searchCity && city) searchCity = city;
  if (!searchCity && memory) {
    const match = memory.match(/moro em ([\w\s]+)/i);
    if (match) searchCity = match[1].trim();
  }

  // 1. AMAZON (products) — always formatter, always US
  if (
    intent === 'AMAZON' ||
    (
      intent === 'GENERIC' &&
      /comprar|quanto custa|pre[çc]o|onde acho|onde encontro|amazon|produto|onde compro|compra/i.test(message)
    )
  ) {
    console.log('[dica.js] AMAZON Dica triggered with message:', message);
    try {
      const items = await amazon.searchAmazonProducts(message);
      console.log('[dica.js] Amazon items returned:', items);
      return replyHelper.amazon(items).content;
    } catch (err) {
      console.error('[dica.js] Amazon error:', err);
      return '💡 Amazon.com é sempre a melhor aposta para produtos nos EUA. Busque pelo nome do item e confira avaliações!';
    }
  }

  // 2. FX (Remitly)
  if (intent === 'FX') {
    return 'Precisa enviar dinheiro pro Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp';
  }

  // 3. EVENTS (Groovoo) — always formatter, top 3 events
  if (
    intent === 'EVENT' ||
    (
      intent === 'GENERIC' &&
      /evento|show|festa|balada|programa(ção)?|agenda|o que fazer|acontece|tem pra fazer/i.test(message)
    )
  ) {
    try {
      // Try city extracted, fallback to profile, fallback to all
      let result = await groovoo.getEvents(searchCity || '');
      let { events } = result;
      if (!events?.length && searchCity) {
        // Fallback: try US-wide
        result = await groovoo.getEvents('USA');
        events = result.events;
      }
      if (events?.length) {
        // Use only top 3 and formatter
        return replyHelper.events(events.slice(0, 3), searchCity).content;
      }
      // Fallback: no events
      return replyHelper.events([], searchCity).content;
    } catch (err) {
      console.error('[dica.js] Groovoo error:', err);
      return 'Não consegui consultar eventos no momento. Tente novamente mais tarde!';
    }
  }

  // TODO: More marketplace/partner integrations

  // Default: no dica for this intent
  return '';
}

module.exports = { getDica };