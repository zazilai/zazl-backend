// helpers/postprocess.js

function cleanCitations(text) {
  if (!text) return '';
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  replyObj.content = cleanCitations(replyObj.content);

  // Robust fallback for broken/empty/short answers
  const content = replyObj.content.trim();
  const tooShort = content.length < 80 && !content.includes('•') && !content.match(/\d\./);
  if (
    !content ||
    tooShort ||
    /^1\.\s*$/.test(content) ||
    content.startsWith('Dica do Zazil')
  ) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente em alguns minutos, ou peça uma explicação mais detalhada!";
    return replyObj;
  }

  // Add trust dica for GENERIC/NEWS (if not already present)
  if (['GENERIC', 'NEWS'].includes(intent)) {
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();
    if (!/dica do zazil/i.test(replyObj.content)) {
      replyObj.content += '\n\nDica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  replyObj.content = replyObj.content.replace(/\n{3,}/g, '\n\n');
  return replyObj;
};