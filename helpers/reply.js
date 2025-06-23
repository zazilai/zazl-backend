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

// Event formatter: always tries to use buy_link/external_shop_url, formats nicely!
function events(list = [], city = '', fallbackText = '', userQuery = '') {
  const dicas = [
    'Chegue cedo pra garantir o melhor lugar!',
    'Convide amigos — quanto mais gente, melhor!',
    'Fique de olho nos grupos de brasileiros da sua cidade!',
    'Leve sua bandeira do Brasil pra animar ainda mais!',
    'Eventos brasileiros costumam lotar rápido – garanta seu ingresso!'
  ];
  const dica = dicas[Math.floor(Math.random() * dicas.length)];

  if (Array.isArray(list) && list.length > 0) {
    const header = `🎉 *Eventos Brasileiros${city ? ` em ${city}` : ''}:*\n`;
    const lines = list.map(evt => {
      const name = evt.name || 'Evento';
      const location = (evt.address && (evt.address.local_name || evt.address.city)) || evt.location || '';
      const dateIso = evt.start_at || evt.start_time || '';
      const url =
        evt.external_shop_url ||
        evt.buy_link ||
        evt.url ||
        evt.facebook_link ||
        evt.instagram_link ||
        '';
      // Date formatting: "2025-12-31T21:00:00.000Z" → 31/12/2025 às 21:00
      let formattedDate = '';
      if (dateIso) {
        try {
          const d = new Date(dateIso);
          formattedDate = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {}
      }
      return [
        `🗓️ *${name}*`,
        location ? `📍 ${location}` : '',
        formattedDate ? `🕒 ${formattedDate}` : '',
        url ? `🔗 [Ingressos / Info](${url})` : ''
      ].filter(Boolean).join('\n');
    }).join('\n\n');
    return {
      type: 'text',
      content: [
        header,
        lines,
        `\n💡 Dica do Zazil: ${dica}`
      ].filter(Boolean).join('\n')
    };
  }

  // If fallback from Perplexity or similar is present
  if (fallbackText && fallbackText.trim().length > 10) {
    return {
      type: 'text',
      content: fallbackText.trim()
    };
  }

  // If nothing found at all
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

Você pode testar o Zazil gratuitamente por 7 dias! Depois disso, se quiser continuar falando comigo, você pode assinar um dos nossos planos, a partir $5 dólares por mês!

💡 Se quiser, para te ajudar melhor, já me conte de onde você está falando (ex: “Sou de Recife, moro em Austin com minha família”)! Assim eu personalizo ainda mais as respostas pra você.

Dicas rápidas:
- Ainda não entendo áudios;
- Prefiro perguntas completas em uma única mensagem.

Da pra assinar o plano mensal agora também, é muito fácil:
🟢 Lite $4.99 (15 msgs/dia): https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}
🔵 Pro $9.99 (ilimitado): https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

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

// Amazon: always formats for US audience, uses url if present, handles Perplexity fallback
function amazon(items) {
  if (!Array.isArray(items) || !items.length) {
    return {
      type: 'text',
      content: '🔎 Não encontrei produtos relevantes na Amazon agora. Tente buscar de outra forma ou com palavras mais específicas!'
    };
  }
  if (items[0].answer) {
    return {
      type: 'text',
      content: `Não achei produtos relevantes na Amazon, mas fiz uma busca extra pra te ajudar:\n\n${items[0].answer}`
    };
  }
  const dica = "\n\n💡 Dica do Zazil: Sempre verifique as avaliações dos produtos antes de comprar na Amazon!";
  const top = items.map(i => {
    const title = i.title || 'Produto';
    const price = i.price || 'Preço não disponível';
    const url = i.url || '';
    return url
      ? `🛒 *${title}*\n💰 ${price}\n🔗 [Comprar na Amazon](${url})`
      : `🛒 *${title}*\n💰 ${price}`;
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

function trialExpired(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `Seu período de teste gratuito de 7 dias acabou! 😢

Para continuar usando o Zazil, escolha um plano a partir de apenas $5 por mês:

🟢 Lite $4.99 (15 msgs/dia): https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}
🔵 Pro $9.99 (ilimitado): https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

Dúvidas? É só responder aqui ou mandar email para zazil@worldofbrazil.ai`
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
  trialExpired
};