// helpers/dica.js
const amazon = require('./amazon');
const groovoo = require('./groovoo');

async function getDica({ intent, message, city }) {
  try {
    switch (intent) {
      case 'AMAZON': {
        const products = await amazon.searchAmazonProducts(message);
        if (products.length)
          return products.map(p =>
            `🛒 *${p.title}*${p.price ? ` por ${p.price}` : ''}\n[Comprar](${p.url})`
          ).join('\n\n');
        return null;
      }
      case 'EVENT': {
        const events = await groovoo.getEvents(city || message);
        if (events.length)
          return events.map(e =>
            `🎉 *${e.name}* em ${e.address?.city || 'local'}\n[Ver evento](${e.url || ''})`
          ).join('\n\n');
        return null;
      }
      default: return null;
    }
  } catch (err) {
    console.error('[dica.js] error', err);
    return null;
  }
}
module.exports = { getDica };