// helpers/reply.js
exports.generic = msg => ({ content: msg });
function dolar(rate) {
  if (!rate || !rate.buy || !rate.sell) {
    return {
      content: "❌ Desculpe, não consegui obter a cotação do dólar agora. Tente novamente em alguns minutos."
    };
  }

  return {
    content: `💵 *Cotação do Dólar Hoje (USD → BRL)*\n\n• 📥 Compra: R$${rate.buy.toFixed(2)}\n• 📤 Venda: R$${rate.sell.toFixed(2)}\n\n🕒 Atualizado em tempo real via AwesomeAPI`
  };
}
const dayjs = require('dayjs');
require('dayjs/locale/pt-br');
dayjs.locale('pt-br');

exports.events = arr => {
  if (!arr.length) {
    return { content: 'Hoje não encontrei eventos no Groovoo. 😕' };
  }
  const lines = arr.map(e => {
    const dt   = dayjs(e.date).format('dddd, DD [de] MMMM [às] HH:mm');
    const link = e.url ? `\n🔗 ${e.url}` : '';
    return `🎤 *${e.name}*\n📍 ${e.city}\n📅 ${dt}${link}`;
  });
  return { content: lines.join('\n\n') };
};

exports.news = digest => ({ content: digest });