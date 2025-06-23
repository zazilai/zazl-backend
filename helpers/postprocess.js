// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * but NEVER changes FX, events, amazon, or cancel replies.
 * Now also removes all [N] reference markers everywhere for cleanliness.
 * For AMAZON and GENERIC, if it mentions Brazilian stores, appends a U.S.-store recommendation.
 *
 * @param {object} replyObj - The reply object (with .content)
 * @param {string} question - The user question (optional, safe default)
 * @param {string} intent - The classified intent (e.g., FX, AMAZON, GENERIC, CANCEL, etc)
 * @returns {object} The adjusted replyObj, safe to send
 */

const BRAZILIAN_RETAILERS = [
  'magazine luiza', 'magalu', 'mercado livre', 'casas bahia', 'americanas',
  'ponto frio', 'submarino', 'extra.com', 'carrefour', 'centauro', 'fast shop'
];

function mentionsBrazilianRetailer(text) {
  const t = text.toLowerCase();
  return BRAZILIAN_RETAILERS.some(biz => t.includes(biz));
}

// Remove all [N] style reference markers anywhere in the text
function cleanCitations(text) {
  if (!text) return '';
  // Removes all instances of [number] everywhere in the text (e.g. [1], [2], [15])
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  replyObj.content = cleanCitations(replyObj.content);

  // If AMAZON or GENERIC and mentions Brazilian retailer, add the dica!
  if ((intent === 'AMAZON' || intent === 'GENERIC') && mentionsBrazilianRetailer(replyObj.content)) {
    replyObj.content += '\n\n💡 Dica do Zazil: Nos EUA, os sites mais confiáveis são Amazon, Best Buy, Walmart, Target, ou lojas locais.';
  }

  // Zazil-ize generic/news/factual AI answers
  if (['GENERIC', 'NEWS'].includes(intent)) {
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();
    if (!replyObj.content.match(/Dica do Zazil:/i)) {
      replyObj.content += '\n\n💡 Dica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  return replyObj;
};