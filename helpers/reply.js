// helpers/reply.js

function generic(content) {
  return { type: 'text', content };
}

function dolar(rate) {
  return {
    type: 'text',
    content: `💵 Cotação do Dólar Hoje:\n\nUS$ 1 = R$ ${rate.buy}\n\nSe estiver pensando em enviar dinheiro para o Brasil, use a Remitly:\nhttps://remit.ly/1bh2ujzp`
  };
}

// Events: WhatsApp-safe, max 3 events, minimal formatting
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
    const header = `🎉 Eventos Brasileiros${city ? ` em ${city}` : ''}:\n`;
    const lines = list.slice(0, 3).map(evt => {
      const name = evt.name || 'Evento';
      const location = (evt.address && evt.address.local_name) || evt.location || '';
      const dateIso = evt.start_at || evt.start_time || '';
      let eventUrl =
        evt.buy_link ||
        evt.external_shop_url ||
        evt.url ||
        evt.facebook_link ||
        evt.instagram_link ||
        '';
      let formattedDate = '';
      if (dateIso) {
        try {
          const d = new Date(dateIso);
          formattedDate = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {}
      }
      return [
        `🗓️ ${name}`,
        location ? `📍 ${location}` : '',
        formattedDate ? `🕒 ${formattedDate}` : '',
        eventUrl ? `Mais informações: ${eventUrl}` : ''
      ].filter(Boolean).join('\n');
    }).join('\n\n');
    return {
      type: 'text',
      content: [
        header,
        lines,
        `\nDica do Zazil: ${dica}`
      ].filter(Boolean).join('\n')
    };
  }
  if (fallbackText && fallbackText.trim().length > 10) {
    return { type: 'text', content: fallbackText.trim() };
  }
  return {
    type: 'text',
    content: [
      `📅 Não achei eventos brasileiros${city ? ` em ${city}` : ''} agora.`,
      `\nDica do Zazil: ${dica}`
    ].filter(Boolean).join('\n')
  };
}

// Amazon: WhatsApp-safe, ONLY ONE product, always returns reply with link if possible
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
  // Only one product for maximum deliverability
  const i = items[0];
  const title = i.title || 'Produto';
  const price = i.price || 'Preço não disponível';
  const url = i.url || '';
  const dica = "\n\nDica: Sempre verifique as avaliações dos produtos antes de comprar na Amazon!";
  let content;
  if (url) {
    content = [
      `Produto recomendado na Amazon:`,
      `🛒 ${title}`,
      `💰 ${price}`,
      `Comprar: ${url}`,
      dica
    ].filter(Boolean).join('\n');
  } else {
    content = [
      `Produto recomendado na Amazon:`,
      `🛒 ${title}`,
      `💰 ${price}`,
      dica
    ].filter(Boolean).join('\n');
  }
  return { type: 'text', content };
}

function news(digest = '') {
  if (!digest.trim()) {
    return {
      type: 'text',
      content: '🗞️ Nenhuma notícia recente encontrada no momento. Tente novamente em breve.'
    };
  }
  return { type: 'text', content: `🗞️ Resumo de Notícias:\n\n${digest}` };
}

function welcome(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `👋 Prazer em te conhecer! Eu sou o Zazil, seu assistente brasileiro para vida no exterior 🇺🇸🇧🇷

Você pode testar o Zazil gratuitamente por 7 dias! Depois disso, se quiser continuar falando comigo, você pode assinar um dos nossos planos, a partir $5 dólares por mês!

Dica: Já me conte de onde você está falando (ex: “Sou de Recife, moro em Austin com minha família”)! Assim eu personalizo ainda mais as respostas pra você.

Dicas rápidas:
- Ainda não entendo áudios;
- Prefiro perguntas completas em uma única mensagem.

Assine agora:
Lite $4.99 (15 msgs/dia): https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}
Pro $9.99 (ilimitado): https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

Ao usar o Zazil, você aceita nossos Termos: https://worldofbrazil.ai/termos e Privacidade: https://worldofbrazil.ai/privacidade.`
  };
}

function upgrade(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `🔒 Você atingiu seu limite diário de mensagens.

Assine o plano Pro ilimitado para continuar usando o Zazil sem limites:
https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}`
  };
}

function cancel(waNumber) {
  const clean = waNumber.replace(/^whatsapp:/, '');
  return {
    type: 'text',
    content: `❌ Para gerenciar ou cancelar sua assinatura do Zazil, acesse o painel seguro da Stripe aqui:
https://zazl-backend.onrender.com/gerenciar?wa=${clean}

Se precisar de ajuda, é só responder por aqui ou enviar um email para zazil@worldofbrazil.ai`
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

Para continuar usando o Zazil, escolha um plano mensal a partir de apenas $5 por mês:

Lite $4.99 (15 msgs/dia): https://zazl-backend.onrender.com/checkout/lite/month?wa=${clean}
Pro $9.99 (ilimitado): https://zazl-backend.onrender.com/checkout/pro/month?wa=${clean}

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