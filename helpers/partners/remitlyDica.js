// helpers/partners/remitlyDica.js

module.exports = async function remitlyDica(message, city, context, intent) {
  // Only run for FX/dólar queries
  if (
    intent !== 'FX' &&
    !/\b(dólar|dolar|câmbio|cambio|remessa|enviar dinheiro|transfer|cotação)\b/i.test(message)
  ) return '';

  return `💸 Dica do Zazil: Precisa enviar dinheiro para o Brasil? Use a Remitly para transferências rápidas e seguras: https://remit.ly/1bh2ujzp`;
};