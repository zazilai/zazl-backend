// helpers/postprocess.js — Better Dedup & Cleaning (July 2025)

function cleanCitations(text) {
  return text.replace(/\s*\[\d+\]/g, '').trim();
}

function dedupeDicas(text) {
  const lines = text.split('\n').map(l => l.trim());
  const unique = [...new Set(lines)].filter(l => l);
  return unique.join('\n').replace(/\n{3,}/g, '\n\n');
}

module.exports = function postprocess(replyObj, incoming) {
  let content = replyObj.content || '';

  content = cleanCitations(content);

  if (!content || content.length < 15) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente!";
    return replyObj;
  }

  if (!/dica do zazil/i.test(content)) {
    content += '\n\nDica do Zazil: Com jeitinho brasileiro, tudo se resolve – volte sempre!';
  }

  content = dedupeDicas(content);

  replyObj.content = content;
  return replyObj;
};