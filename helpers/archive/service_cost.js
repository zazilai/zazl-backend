// helpers/service_cost.js

function serviceCost(question) {
  // Super friendly, practical template
  return {
    type: 'text',
    content: `💡 O preço de serviços pode variar muito nos EUA, dependendo da cidade, profissional e tipo de serviço. Recomendo consultar sites locais (como Yelp ou Google Maps) para ver avaliações e preços atualizados — ou pedir recomendações em grupos de brasileiros da região.

Dica do Zazil: Sempre peça orçamento antes e combine tudo por escrito, tá bom?

Se quiser algo mais específico, me fala a cidade ou detalhes do serviço!`
  };
}

module.exports = { serviceCost };