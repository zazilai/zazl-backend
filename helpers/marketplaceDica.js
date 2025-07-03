// helpers/marketplaceDica.js
const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
// Add more: lawyerDica, restaurantDica, etc as needed

/**
 * Always returns up to 3 Dicas per partner, WhatsApp-friendly, additive only.
 * @param {Object} args - { message, city, context, intent }
 * @returns {Promise<string>} - WhatsApp-formatted dica block or ''
 */
async function getMarketplaceDica({ message, city, context, intent }) {
  const dicas = [];

  // Amazon
  const amazon = await amazonDica(message, city, context, intent);
  if (amazon && amazon.length) dicas.push(...amazon.slice(0, 3));

  // Events
  const events = await eventsDica(message, city, context, intent);
  if (events && typeof events === 'string' && events.trim()) dicas.push(events.trim());

  // Add other partners here, each must return up to 3.

  // Return joined dicas (each block separated by two newlines for WhatsApp)
  return dicas.slice(0, 3).join('\n\n');
}

module.exports = getMarketplaceDica;