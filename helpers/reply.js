// helpers/reply.js

function generic(content) {
  return { type: 'text', content };
}

function dolar(rate) {
  return {
    type: 'text',
    content: `💵 *Cotação do Dólar Hoje:*

US$ 1 = R$ ${rate.buy}

💸 Se estiver pensando em enviar dinheiro para o Brasil, use o Remitly com segurança e rapidez:
https://remit.ly/1bh2ujzp`
  };
}

function events(list = []) {
  if (!list.length) {
    return {
      type: 'text',
      content: '📅 Nenhum evento encontrado no momento. Tente novamente mais tarde!'
    };
  }

  const header = '🎉 *Eventos em Destaque:*
';
  const lines = list.map(evt => `• ${evt.name || 'Evento'} — ${evt.start_time || 'Data indefinida'}
${evt.location || ''}
${evt.url}`).join('\n\n');
  return {
    type: 'text',
    content: `${header}\n${lines}`
  };
}

function news(digest = '') {
  return {
    type: 'text',
    content: `🗞️ *Resumo de Notícias:*
\n${digest}`
  };
}

function welcome(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `👋 Prazer em te conhecer! Eu sou o Zazil, seu assistente brasileiro nos EUA 🇺🇸🇧🇷\n\nVocê está no plano *Lite grátis por 7 dias* — pode me mandar até 15 mensagens por dia!\n\n💡 Se quiser mais liberdade:\n🟢 Assinar Lite (15 msgs/dia):\nhttps://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}\n\n🔵 Assinar Pro (mensagens ilimitadas):\nhttps://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}\n\n❗ *Importante:*\n- Não envio nem entendo áudios;\n- Prefiro que mande sua pergunta completa em uma única mensagem.\n\nAo usar o Zazil, você aceita nossos [Termos](https://worldofbrazil.ai/termos) e [Privacidade](https://worldofbrazil.ai/privacidade).`
  };
}

function upgrade(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `🔒 Você atingiu seu limite diário de mensagens.\n\nAssine o plano *Pro ilimitado* para continuar usando o Zazil sem limites:\n👉 https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}`
  };
}

function cancel() {
  return {
    type: 'text',
    content: `❌ Para gerenciar ou cancelar sua assinatura, acesse:\nhttps://worldofbrazil.ai/gerenciar`
  };
}

function amazon(items = []) {
  if (!items.length) {
    return {
      type: 'text',
      content: '🔎 Não encontrei produtos relevantes no momento. Tente buscar de outra forma ou com palavras mais específicas!'
    };
  }

  const top = items.slice(0, 3).map(i => {
    const title = i.ItemInfo?.Title?.DisplayValue;
    const price = i.Offers?.Listings?.[0]?.Price?.DisplayAmount;
    const url = i.DetailPageURL;
    return `🛒 *${title}*\n💰 ${price}\n🔗 ${url}`;
  }).join('\n\n');

  return {
    type: 'text',
    content: `✨ *Produtos encontrados na Amazon:*\n\n${top}`
  };
}

module.exports = {
  generic,
  dolar,
  events,
  news,
  welcome,
  upgrade,
  cancel,
  amazon
};