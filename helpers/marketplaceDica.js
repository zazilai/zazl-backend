// helpers/marketplaceDica.js

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');

async function getMarketplaceDica({ message, city, context }) {
  const dicas = [];

  // Amazon "Dica" (product-related)
  try {
    const amazon = await amazonDica(message, city, context);
    if (amazon) dicas.push(amazon);
  } catch (e) {
    console.error('[MarketplaceDica] amazonDica error:', e);
  }

  // Events "Dica" (event-related)
  try {
    const events = await eventsDica(message, city, context);
    if (events) dicas.push(events);
  } catch (e) {
    console.error('[MarketplaceDica] eventsDica error:', e);
  }

  // Add more partners here as needed

  // Always purely additive, never blocks
  return dicas.join('\n\n');
}

module.exports = getMarketplaceDica;