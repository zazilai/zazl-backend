// helpers/reply.js (Cleaned for Production)

function generic(content) {
  return { type: 'text', content };
}

function dolar(rate) {
  return {
    type: 'text',
    content: `💵 Cotação do Dólar Hoje:

US$ 1 = R$ ${rate.buy}

Se estiver pensando em enviar dinheiro para o Brasil, use a Remitly:
https://remit.ly/1bh2ujzp`
  };
}

function amazon(items) {
  if (!Array.isArray(items) || !items.length) {
    return generic('🔎 Não encontrei produtos relevantes na Amazon agora. Tente buscar de outra forma ou com palavras mais específicas!');
  }
  const i = items[0];
  return generic([
    `🛒 *Dica do Zazil – Produto na Amazon*`,
    i.title && `Produto: ${i.title}`,
    i.price && `Preço: ${i.price}`,
    i.url && `Comprar: ${i.url}`,
    `\nDica: Sempre confira as avaliações e comentários antes de comprar!`
  ].filter(Boolean).join('\n'));
}

function events(list = [], city = '', fallbackText = '') {
  if (!list.length) {
    return generic(
      fallbackText && fallbackText.trim().length > 10
        ? fallbackText.trim()
        : `📅 Não achei eventos brasileiros${city ? ` em ${city}` : ''} agora.\nDica do Zazil: Confira sempre grupos e páginas de brasileiros para novidades!`
    );
  }

  const header = `💡 *Dica do Zazil – Eventos Brasileiros nos EUA*`;
  const lines = list.slice(0, 3).map(evt => {
    const d = new Date(evt.start_at || '');
    return [
      `🗓️ ${evt.name || 'Evento'}`,
      evt.address?.city && `📍 ${evt.address.city}`,
      (evt.address?.local_name || evt.address?.address) && `🏟️ ${evt.address.local_name || evt.address.address}`,
      evt.start_at && `🕒 ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      (evt.external_shop_url || evt.instagram_link || evt.facebook_link) && `🎟️ Ingressos: ${evt.external_shop_url || evt.instagram_link || evt.facebook_link}`
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return generic([header, lines, `\nDica: Chegue cedo, convide amigos e confirme o local antes de comprar ingressos!`].join('\n\n'));
}

function news(digest = '') {
  return generic(digest.trim()
    ? `🗞️ Resumo de Notícias:\n\n${digest}`
    : '🗞️ Nenhuma notícia recente encontrada no momento. Tente novamente em breve.');
}

function fallback() {
  return generic("Foi mal, ocorreu um erro inesperado. Tente novamente em alguns minutos, ou mude um pouco sua mensagem para eu entender melhor o contexto. Se precisar de suporte, responda aqui ou mande email para zazil@worldofbrazil.ai");
}

function fallbackOutage() {
  return generic("Eita, ocorreu um probleminha aqui com o sistema. Me dá uns minutinhos e pode me perguntar de novo por favor? 😉\n\nSe precisar de suporte imediato: zazil@worldofbrazil.ai");
}

module.exports = {
  generic,
  dolar,
  amazon,
  events,
  news,
  fallback,
  fallbackOutage
};