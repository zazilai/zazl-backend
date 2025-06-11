// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * but NEVER changes FX, events, amazon, or cancel replies.
 * Defensive: Never throws if missing args.
 *
 * @param {object} replyObj - The reply object (with .content)
 * @param {string} question - The user question (optional, safe default)
 * @param {string} intent - The classified intent (e.g., FX, AMAZON, GENERIC, CANCEL, etc)
 * @returns {object} The adjusted replyObj, safe to send
 */
module.exports = function postprocess(replyObj, question = '', intent = '') {
  // Defensive: Avoid nulls/undefined everywhere
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }

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

  // Everything else (fx, amazon, events, cancel, etc) — NO CHANGE
  return replyObj;
};