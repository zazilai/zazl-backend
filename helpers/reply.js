const dayjs = require('dayjs');
require('dayjs/locale/pt-br');
dayjs.locale('pt-br');

function generic(msg) {
  return { content: msg };
}

function dolar(rate) {
  if (!rate || !rate.buy || !rate.sell) {
    console.warn('[replyHelper] Invalid FX rate:', rate);
    return {
      content: "❌ Desculpe, não consegui obter a cotação do dólar agora. Tente novamente em alguns minutos."
    };
  }

  const formatted = {
    content: `💵 *Cotação do Dólar Hoje (USD → BRL)*\n\n• 📥 Compra: R$${rate.buy.toFixed(2)}\n• 📤 Venda: R$${rate.sell.toFixed(2)}\n\n🧠 Fonte: Zazil Finanças`
  };

  console.log('[replyHelper] Returning FX content:', formatted);
  return formatted;
}

function events(arr) {
  if (!arr.length) {
    return { content: "Hoje não encontrei eventos no Groovoo. 🤷‍♂️" };
  }

  const lines = arr.map(e => {
    const dt = dayjs(e.date).format('dddd, DD [de] MMMM [às] HH:mm');
    const link = e.url ? `\n🔗 ${e.url}` : '';
    return `📍 *${e.name}*\n📌 ${e.city} 🗓️ ${dt}${link}`;
  });

  return { content: lines.join('\n\n') };
}

function news(digest) {
  return { content: digest };
}

module.exports = {
  generic,
  dolar,
  events,
  news
};