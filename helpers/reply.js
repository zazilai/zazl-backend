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

// Improved events function with clean Perplexity fallback!
function events(list = [], city = '', fallbackText = '', userQuery = '') {
  const dicas = [
    'Chegue cedo pra garantir o melhor lugar!',
    'Convide amigos — quanto mais gente, melhor!',
    'Fique de olho nos grupos de brasileiros da sua cidade!',
    'Leve sua bandeira do Brasil pra animar ainda mais!',
    'Eventos brasileiros costumam lotar rápido – garanta seu ingresso!'
  ];
  const dica = dicas[Math.floor(Math.random() * dicas.length)];

  if (list.length > 0) {
    const header = `🎉 *Eventos Brasileiros${city ? ` em ${city}` : ''}:*\n\n`;
    const lines = list.map(evt => {
      const date = evt.start_time || '';
      const name = evt.name || '';
      const location = evt.location || '';
      const url = evt.url || '';
      return `🗓️ *${name}*\n📍 ${location}\n🕒 ${date}\n🔗 ${url}`;
    }).join('\n\n');
    return {
      type: 'text',
      content: [
        header + lines,
        `\n💡 Dica do Zazil: ${dica}`,
        `\nQuer receber alertas de novos eventos? Só responder “sim” nos próximos 5 minutos.`,
        `\nConhece outro evento brasileiro${city ? ` em ${city}` : ''}? Me mande aqui que ajudo a divulgar!`
      ].filter(Boolean).join('\n')
    };
  }

  // If Perplexity fallback is present, just return it directly (no "eventos dos parceiros" text)
  if (fallbackText && fallbackText.trim().length > 10) {
    return {
      type: 'text',
      content: fallbackText.trim()
    };
  }

  // Nothing found at all
  return {
    type: 'text',
    content: [
      `📅 Não achei eventos brasileiros${city ? ` em ${city}` : ''} agora.`,
      `\n💡 Dica do Zazil: ${dica}`
    ].filter(Boolean).join('\n')
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

function fallback() {
  return {
    type: 'text',
    content: "Foi mal, ocorreu um erro inesperado. Tente novamente em alguns minutos, ou mude um pouco sua mensagem para eu entender melhor o contexto. Se precisar de suporte, responda aqui ou mande email para zazil@worldofbrazil.ai"
  };
}

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