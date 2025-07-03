// helpers/postprocess.js

function cleanCitations(text) {
  if (!text) return '';
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

function dedupeDicas(text) {
  // Find all occurrences of 'Dica do Zazil' (case-insensitive)
  const dicaRegex = /(\n?Dica do Zazil:.*?)(?=\n|$)/gis;
  let first = null;
  let result = '';
  let lastIndex = 0;

  let match;
  while ((match = dicaRegex.exec(text))) {
    if (!first) {
      first = match[0];
      result += text.slice(lastIndex, match.index) + first;
    }
    lastIndex = dicaRegex.lastIndex;
  }

  // If no dicas found, just return cleaned text
  if (!first) return text;
  // Append any remaining text after the last dica
  result += text.slice(lastIndex);

  // Remove extra dicas (if any) outside the first
  // Also, compress any 3+ consecutive line breaks
  return result.replace(dicaRegex, '').replace(/\n{3,}/g, '\n\n');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  let content = cleanCitations(replyObj.content).trim();

  // Fallback if answer is empty, broken, or just '1.'
  if (!content || /^1\.\s*$/.test(content) || content.length < 15) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente em alguns minutos, ou peça uma explicação mais detalhada!";
    return replyObj;
  }

  // Always ensure at least one Dica if none present (case-insensitive)
  if (!/dica do zazil/i.test(content)) {
    content += '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
  }

  // Remove duplicates, keeping only the first one
  replyObj.content = dedupeDicas(content);
  return replyObj;
};