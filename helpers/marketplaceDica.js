// helpers/marketplaceDica.js

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
// Add other partners here as needed

/**
 * Runs all partner dica modules, passing the detected intent and message/context.
 * Each module should decide if it returns a dica (max 3 results if multiple).
 * Returns a single string (max 3 entries total, joined).
 */
module.exports = async function getMarketplaceDica({ message, city, context, intent }) {
  let dicas = [];

  // Each partner returns an array (up to 3 entries, or empty if not relevant)
  const amazon = await amazonDica(message, city, context, intent);
  if (amazon && amazon.length) dicas.push(...amazon.slice(0, 3));

  const events = await eventsDica(message, city, context, intent);
  if (events && events.length) dicas.push(...events.slice(0, 3));

  // Add more partners here...

  // Limit: only the first 3 combined dicas, so no spam
  return dicas.slice(0, 3).join('\n\n');
};