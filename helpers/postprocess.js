// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * but NEVER changes FX, events, amazon, or cancel replies.
 * Now also removes all [N] reference markers everywhere for cleanliness.
 *
 * @param {object} replyObj - The reply object (with .content)
 * @param {string} question - The user question (optional, safe default)
 * @param {string} intent - The classified intent (e.g., FX, AMAZON, GENERIC, CANCEL, etc)
 * @returns {object} The adjusted replyObj, safe to send
 */

// Remove all [N] style reference markers anywhere in the text
function cleanCitations(text) {
  if (!text) return '';
  // Removes all instances of [number] everywhere in the text (e.g. [1], [2], [15])
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  // Defensive: Avoid nulls/undefined everywhere
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }

  // Remove all [N] markers everywhere, all intents
  replyObj.content = cleanCitations(replyObj.content);

  // Normalize for downstream checks
  const normalized = (question || '').toLowerCase();

  // Only "Zazil-ize" generic/news/factual AI answers (NEVER touch special flows)
  if (['GENERIC', 'NEWS'].includes(intent)) {
    // Remove "Sources" section (Perplexity etc)
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();

    // Add a classic Zazil tip, unless it's already there
    if (!replyObj.content.match(/Dica do Zazil:/i)) {
      replyObj.content += '\n\n💡 Dica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  // Everything else (fx, amazon, events, cancel, etc) — NO CHANGE beyond [N] cleanup
  return replyObj;
};