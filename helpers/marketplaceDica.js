// helpers/marketplaceDica.js

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
// Plug more: lawyerDica, restaurantDica, etc.

async function getMarketplaceDica({ message, city, context }) {
  const dicas = [];

  // Run each partner dica — you can prioritize order, or use only the first found.
  const amazon = await amazonDica(message, city, context);
  if (amazon) dicas.push(amazon);

  const events = await eventsDica(message, city, context);
  if (events) dicas.push(events);

  // TODO: add more partners here as needed (lawyer, restaurant, promo, etc)

  // Join all non-empty dicas, separated by line breaks
  return dicas.join('\n\n');
}

module.exports = getMarketplaceDica;