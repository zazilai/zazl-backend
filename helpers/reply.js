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

// Amazon: Only for product/shopping queries, one product max
function amazon(items) {
  if (!Array.isArray(items) || !items.length) {
    return {
      type: 'text',
      content: '🔎 Não encontrei produtos relevantes na Amazon agora. Tente buscar de outra forma ou com palavras mais específicas!'
    };
  }
  const i = items[0];
  return {
    type: 'text',
    content: [
      `🛒 *Dica do Zazil – Produto na Amazon*`,
      i.title ? `Produto: ${i.title}` : '',
      i.price ? `Preço: ${i.price}` : '',
      i.url ? `Comprar: ${i.url}` : '',
      `\nDica: Sempre confira as avaliações e comentários antes de comprar!`
    ].filter(Boolean).join('\n')
  };
}

// Events: Only called when eventsDica fires; never added on product/news/etc.
function events(list = [], city = '', fallbackText = '') {
  if (!Array.isArray(list) || !list.length) {
    return {
      type: 'text',
      content: fallbackText && fallbackText.trim().length > 10
        ? fallbackText.trim()
        : `📅 Não achei eventos brasileiros${city ? ` em ${city}` : ''} agora.\nDica do Zazil: Confira sempre grupos e páginas de brasileiros para novidades!`
    };
  }

  const header = `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*`;
  const lines = list.slice(0, 3).map(evt => {
    const name = evt.name || 'Evento';
    const cityLine = evt.address?.city ? `📍 ${evt.address.city}` : '';
    const location = evt.address?.local_name || evt.address?.address || '';
    const dateIso = evt.start_at || '';
    let formattedDate = '';
    if (dateIso) {
      try {
        const d = new Date(dateIso);
        formattedDate = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      } catch {}
    }
    const link = evt.external_shop_url || evt.instagram_link || evt.facebook_link || '';
    return [
      `🗓️ ${name}`,
      cityLine,
      location ? `🏟️ ${location}` : '',
      formattedDate ? `🕒 ${formattedDate}` : '',
      link ? `🎟️ Ingressos: ${link}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return {
    type: 'text',
    content: [header, lines, `\nDica: Chegue cedo, convide amigos e confirme o local antes de comprar ingressos!`].filter(Boolean).join('\n\n')
  };
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