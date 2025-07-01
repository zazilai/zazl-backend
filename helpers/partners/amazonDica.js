// helpers/partners/amazonDica.js

const searchAmazonProducts = require('../amazon'); // Should be your API integration

module.exports = async function amazonDica(message, city, context) {
  if (!/amazon|comprar|quanto custa|onde acho|onde compro|produto/i.test(message)) return '';
  try {
    const items = await searchAmazonProducts(message);
    if (!items || !items.length) return '';
    const item = items[0];
    return [
      '💡 Dica do Zazil:',
      `🛒 Produto recomendado: ${item.title || 'Produto'}`,
      `💰 ${item.price || 'Preço não disponível'}`,
      item.url ? `Comprar: ${item.url}` : '',
      'Dica: Sempre confira as avaliações antes de comprar na Amazon!'
    ].filter(Boolean).join('\n');
  } catch (e) {
    return '';
  }
};