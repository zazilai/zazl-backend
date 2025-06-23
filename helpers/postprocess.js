// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * never changes FX, events, amazon, or cancel replies.
 * Removes all [N] reference markers everywhere for cleanliness.
 */

function cleanCitations(text) {
  if (!text) return '';
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  replyObj.content = cleanCitations(replyObj.content);

  // Add trust dica for GENERIC/NEWS (if not already present)
  if (['GENERIC', 'NEWS'].includes(intent)) {
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();
    if (!/dica do zazil/i.test(replyObj.content)) {
      replyObj.content += '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  // Fallback for empty
  if (!replyObj.content.trim()) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta agora. Tente novamente em alguns minutos, ou pergunte de outro jeito!";
  }

  replyObj.content = replyObj.content.replace(/\n{3,}/g, '\n\n');
  return replyObj;
};