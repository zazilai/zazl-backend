// helpers/marketplaceDica.js

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica'); // (see file below)

/**
 * Returns the single most relevant marketplace dica for this query/context.
 * Priority: Amazon > Events > Remitly > (generic added only in prompt, if needed)
 */
module.exports = async function getMarketplaceDica({ message, city, context, intent }) {
  // AMAZON: Shopping/product/where to buy/price queries
  if (
    intent === 'AMAZON' ||
    /\b(comprar|produto|preço|quanto custa|amazon|onde|loja)\b/i.test(message)
  ) {
    const amazon = await amazonDica(message, city, context, intent);
    if (amazon && amazon.length) return amazon[0]; // Only top result
  }

  // EVENTS: Event/agenda/entertainment queries
  if (
    intent === 'EVENT' ||
    /\b(evento|agenda|show|balada|festa|programa|o que fazer)\b/i.test(message)
  ) {
    const events = await eventsDica(message, city, context, intent);
    if (events) return events;
  }

  // FX: Dólar/remittance queries
  if (
    intent === 'FX' ||
    /\b(dólar|dolar|câmbio|cambio|remessa|enviar dinheiro|transfer|cotação)\b/i.test(message)
  ) {
    const remitly = await remitlyDica(message, city, context, intent);
    if (remitly) return remitly;
  }

  // Otherwise, return nothing — prompt can add generic dica if needed
  return '';
};