// helpers/reply.js
exports.generic = msg => ({ content: msg });
exports.dolar   = rateObj => ({ content: `US$1 = R$${rateObj.rate}` });

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