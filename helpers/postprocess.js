// helpers/postprocess.js

function cleanCitations(text) {
  if (!text) return '';
  // Remove reference marks like [3]
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

function dedupeDicas(text) {
  // Remove duplicate 'Dica do Zazil' blocks, keep only the first occurrence
  const dicaRegex = /(Dica do Zazil:.*?)(?=(\n|$))/gis;
  let found = false;
  return text.replace(dicaRegex, (match) => {
    if (!found) {
      found = true;
      return match;
    }
    return '';
  }).replace(/\n{3,}/g, '\n\n');
}

// Inserts a [TRUNCATE_MARKER] after ~900 characters, ideally at sentence end
function insertTruncateMarker(text, maxLen = 900) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastPeriod = slice.lastIndexOf('.');
  const cutAt = lastPeriod > 500 ? lastPeriod + 1 : maxLen; // prefer cut after a sentence, but not too early
  return text.slice(0, cutAt) + '\n\n[TRUNCATE_MARKER]\n\n' + text.slice(cutAt);
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  let content = cleanCitations(replyObj.content).trim();

  // Fallback for broken/empty answers
  if (!content || /^1\.\s*$/.test(content) || content.length < 15) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente em alguns minutos, ou peça uma explicação mais detalhada!";
    return replyObj;
  }

  // Ensure at least one "Dica do Zazil"
  if (!/dica do zazil/i.test(content)) {
    content += '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
  }

  // Remove duplicates
  content = dedupeDicas(content);

  // Add truncation marker if too long (handled in index)
  content = insertTruncateMarker(content, 900);

  replyObj.content = content.replace(/\n{3,}/g, '\n\n');
  return replyObj;
};