// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * but NEVER changes FX, events, amazon, or cancel replies.
 * Also removes all [N] reference markers everywhere for cleanliness.
 * For AMAZON and GENERIC, if it mentions Brazilian stores, appends a U.S.-store recommendation.
 */

const BRAZILIAN_RETAILERS = [
  'magazine luiza', 'magalu', 'mercado livre', 'casas bahia', 'americanas',
  'ponto frio', 'submarino', 'extra.com', 'carrefour', 'centauro', 'fast shop'
];
const US_STORES = [
  'Amazon', 'Best Buy', 'Walmart', 'Target', 'Costco', 'Sam’s Club'
];

function mentionsBrazilianRetailer(text) {
  const t = text.toLowerCase();
  return BRAZILIAN_RETAILERS.some(biz => t.includes(biz));
}

// Remove all [N] style reference markers anywhere in the text
function cleanCitations(text) {
  if (!text) return '';
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  replyObj.content = cleanCitations(replyObj.content);

  // If AMAZON or GENERIC and mentions Brazilian retailer, add the dica!
  if ((intent === 'AMAZON' || intent === 'GENERIC') && mentionsBrazilianRetailer(replyObj.content)) {
    replyObj.content += `\n\n💡 Dica do Zazil: Nos EUA, prefira comprar nas lojas confiáveis como ${US_STORES.join(', ')} ou sites locais.`;
  }

  // Zazil-ize generic/news/factual AI answers
  if (['GENERIC', 'NEWS'].includes(intent)) {
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();
    if (!replyObj.content.match(/Dica do Zazil:/i)) {
      replyObj.content += '\n\n💡 Dica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  // Last resort: if reply is still empty (should never happen)
  if (!replyObj.content.trim()) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta agora. Tente novamente em alguns minutos, ou pergunte de outro jeito!";
  }

  // Clean up any accidental double newlines
  replyObj.content = replyObj.content.replace(/\n{3,}/g, '\n\n');

  return replyObj;
};