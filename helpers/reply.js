// helpers/reply.js

function generic(content) {
  return { type: 'text', content };
}

function dolar(rate) {
  return {
    type: 'text',
    content: `💵 *Cotação do Dólar Hoje:*

US$ 1 = R$ ${rate.buy}

Se estiver pensando em enviar dinheiro para o Brasil, use a Remitly:
👉 https://remit.ly/1bh2ujzp`
  };
}

function events(list = []) {
  if (!list.length) {
    return {
      type: 'text',
      content: '📅 Nenhum evento encontrado no momento. Tente novamente mais tarde!'
    };
  }

  const header = '🎉 *Eventos em Destaque:*\n\n';
  const lines = list.map(evt => {
    const date = evt.start_time || '';
    const name = evt.name || '';
    const location = evt.location || '';
    const url = evt.url || '';
    return `🗓️ *${name}*\n📍 ${location}\n🕒 ${date}\n🔗 ${url}`;
  }).join('\n\n');

  return {
    type: 'text',
    content: header + lines
  };
}

function news(digest = '') {
  if (!digest.trim()) {
    return {
      type: 'text',
      content: '🗞️ Nenhuma notícia recente encontrada no momento. Tente novamente em breve.'
    };
  }

  return {
    type: 'text',
    content: `🗞️ *Resumo de Notícias:*

${digest}`
  };
}

function welcome(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `👋 Olá, eu sou o Zazil — seu amigo brasileiro inteligente nos EUA 🇧🇷🤖

🎁 *Teste grátis por 7 dias!*  
Por agora, você pode usar o Zazil de graça para experimentar tudo que ele faz!

🚀 *Planos disponíveis:*
- 🟢 *Lite*: $4.99/mês, até 15 mensagens por dia
- 🔵 *Pro*: $9.99/mês, mensagens ilimitadas!

Assine já para liberar todo o potencial do Zazil:  
Lite 👉 https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}  
Pro 👉 https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

❗ *Importante*:  
- Ainda não entendo áudios ou mensagens de voz  
- Por favor mandar perguntas completas em uma mensagem unica!

Ao usar o Zazil, você aceita nossos [Termos](https://worldofbrazil.ai/termos) e [Privacidade](https://worldofbrazil.ai/privacidade).

Assina aí, vai! 😉`
  };
}

function upgrade(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `🔒 Você atingiu seu limite diário de mensagens.

Assine o plano *Pro ilimitado* para continuar usando o Zazil sem limites:
👉 https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}`
  };
}

// ---- UPDATED FUNCTION ----
function cancel(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `❌ Para gerenciar ou cancelar sua assinatura, acesse:
https://zazl-backend.onrender.com/gerenciar?wa=${clean}`
  };
}

function amazon(items) {
  // Defensive: ensure items is always an array
  if (!Array.isArray(items) || !items.length) {
    return {
      type: 'text',
      content: '🔎 Não encontrei produtos relevantes no momento. Tente buscar de outra forma ou com palavras mais específicas!'
    };
  }

  const top = items.map(i => {
    const title = i.title || 'Produto';
    const price = i.price || 'Preço não disponível';
    const url = i.url || '';
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