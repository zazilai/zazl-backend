// helpers/reply.js

function generic(content) {
  return { type: 'text', content };
}

function dolar(rate) {
  return {
    type: 'text',
    content: `💵 *Cotação do Dólar Hoje:*\n\nUS$ 1 = R$ ${rate.buy}\nFonte: Remessa Online`
  };
}

function events(list = []) {
  if (!list.length) {
    return {
      type: 'text',
      content: '📅 Nenhum evento encontrado no momento. Tente novamente mais tarde!'
    };
  }

  const header = '🎉 *Eventos em Destaque:*\n';
  const lines = list.map(evt => `• ${evt.name} — ${evt.start_time}\n${evt.location || ''}\n${evt.url}`).join('\n\n');
  return {
    type: 'text',
    content: `${header}\n${lines}`
  };
}

function news(digest = '') {
  return {
    type: 'text',
    content: `🗞️ *Resumo de Notícias:*\n\n${digest}`
  };
}

function welcome() {
  return {
    type: 'text',
    content: `👋 Prazer em conhecer!\n\nEu sou o Zazil. Estou aqui pra te ajudar com dicas sobre inglês, cultura americana, processos do dia-a-dia, eventos e muito mais.\n\n❗ *Importante:*\n- Não envio nem entendo áudios;\n- Prefiro que mande sua pergunta completa em uma única mensagem.\n\nAo usar o Zazil, você aceita nossos [Termos](https://worldofbrazil.ai/termos) e [Privacidade](https://worldofbrazil.ai/privacidade).\n\nPode mandar sua primeira pergunta!`
  };
}

function upgrade() {
  return {
    type: 'text',
    content: `🔒 Você atingiu seu limite diário de mensagens.\n\nAssine o plano *Pro ilimitado* para continuar usando o Zazil sem limites:\n👉 https://zazl.onrender.com/checkout/pro/month?wa=`
  };
}

module.exports = {
  generic,
  dolar,
  events,
  news,
  welcome,
  upgrade
};