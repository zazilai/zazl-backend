// helpers/postprocess.js — Stronger Hallucination Check with Relevance (July 2025)

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanCitations(text) {
  return text.replace(/\s*\[\d+\]/g, '').trim();
}

function dedupeDicas(text) {
  const lines = text.split('\n').map(l => l.trim());
  const unique = [...new Set(lines)].filter(l => l);
  return unique.join('\n').replace(/\n{3,}/g, '\n\n');
}

// AI-driven hallucination and relevance check
async function checkHallucination(content, incoming) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: 'system', content: 'Verifique se a resposta contém alucinações, fatos não verificados, ou conteúdo irrelevante para a pergunta (e.g., cidade errada). Retorne "sim" (tem problema) ou "não".' },
        { role: 'user', content: `Pergunta: ${incoming}\nResposta: ${content}` }
      ]
    });
    return response.choices[0].message.content.trim().toLowerCase() === 'sim';
  } catch (err) {
    console.error('[Postprocess] Error:', err);
    return false;
  }
}

module.exports = async function postprocess(replyObj, incoming) {
  let content = replyObj.content || '';

  content = cleanCitations(content);

  if (!content || content.length < 15) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente!";
    return replyObj;
  }

  const hasIssue = await checkHallucination(content, incoming);
  if (hasIssue) {
    content = "Desculpe, detectei algo incerto ou irrelevante na resposta. Aqui vai uma versão segura: Consulte fontes oficiais. Dica do Zazil: Com paciência, tudo se resolve!";
  }

  if (!/dica do zazil/i.test(content)) {
    content += '\n\nDica do Zazil: Com jeitinho brasileiro, tudo se resolve – volte sempre!';
  }

  content = dedupeDicas(content);

  replyObj.content = content;
  return replyObj;
};