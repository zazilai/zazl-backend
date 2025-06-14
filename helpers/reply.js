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

// EVENTS — Now includes image link if present
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
    const image = evt.image ? `[🖼️ Ver imagem do evento](${evt.image})\n` : '';
    return `${image}🗓️ *${name}*\n📍 ${location}\n🕒 ${date}\n🔗 ${url}`;
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
    content: `🗞️ *Resumo de Notícias:*\n\n${digest}`
  };
}

function welcome(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `👋 Prazer em te conhecer! Eu sou o Zazil, seu assistente brasileiro para vida no exterior 🇺🇸🇧🇷

Você pode testar o Zazil gratuitamente por 7 dias! Depois disso, se quiser continuar falando comigo, você pode assinar um dos nossos planos, a partir $5 dolares por mes!

💡 Se quiser, para te ajudar melhor, já me conte de onde você está falando (ex: “Sou de Recife, moro em Austin com minha família”)! Assim eu personalizo ainda mais as respostas pra você.

Dicas rápidas:
- Ainda não entendo áudios;
- Prefiro perguntas completas em uma única mensagem.

Da pra assinar o plano agora também, é muito fácil:
🟢 Lite (15 msgs/dia): https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}
🔵 Pro (ilimitado): https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

Ao usar o Zazil, você aceita nossos [Termos](https://worldofbrazil.ai/termos) e [Privacidade](https://worldofbrazil.ai/privacidade).`
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

function cancel(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `❌ Para gerenciar ou cancelar sua assinatura do Zazil, acesse o painel seguro da Stripe aqui:\nhttps://zazl-backend.onrender.com/gerenciar?wa=${clean}

Se precisar de ajuda, é só responder por aqui ou enviar um email para zazil@worldofbrazil.ai`
  };
}

function amazon(items) {
  if (!Array.isArray(items) || !items.length) {
    return {
      type: 'text',
      content: '🔎 Não encontrei produtos relevantes na Amazon agora. Tente buscar de outra forma ou com palavras mais específicas!'
    };
  }
  const dica = "\n\n💡 Dica do Zazil: Sempre verifique as avaliações dos produtos antes de comprar na Amazon!";
  const top = items.map(i => {
    const title = i.title || 'Produto';
    const price = i.price || 'Preço não disponível';
    const url = i.url || '';
    return `🛒 *${title}*\n💰 ${price}\n🔗 [Comprar na Amazon](${url})`;
  }).join('\n\n');
  return {
    type: 'text',
    content: `✨ *Dica do Zazil: Produtos recomendados na Amazon*\n\n${top}${dica}`
  };
}

// --- Standard Fallback ---
function fallback() {
  return {
    type: 'text',
    content: "Foi mal, ocorreu um erro inesperado. Tente novamente em alguns minutos, ou mude um pouco sua mensagem para eu entender melhor o contexto. Se precisar de suporte, responda aqui ou mande email para zazil@worldofbrazil.ai"
  };
}

// --- Outage Fallback (for Firebase etc) ---
function fallbackOutage() {
  return {
    type: 'text',
    content: "Eita, ocorreu um probleminha aqui com o sistema. Me dá uns minutinhos e pode me perguntar de novo por favor? 😉\n\nSe precisar de suporte imediato: zazil@worldofbrazil.ai"
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
  amazon,
  fallback,
  fallbackOutage,
};