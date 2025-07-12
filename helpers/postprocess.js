// helpers/postprocess.js — Better Dedup, Cleaning & Hallucination Check (July 2025)

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

// AI-driven hallucination check
async function checkHallucination(content, incoming) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: 'system', content: 'Verifique se a resposta contém alucinações ou fatos não verificados para a pergunta. Retorne "sim" (tem alucinação) ou "não".' },
        { role: 'user', content: `Pergunta: ${incoming}\nResposta: ${content}` }
      ]
    });
    return response.choices[0].message.content.trim().toLowerCase() === 'sim';
  } catch (err) {
    console.error('[Postprocess Hallucination] Error:', err);
    return false; // Assume no hallucination on error to avoid blocking
  }
}

module.exports = async function postprocess(replyObj, incoming) {  // Made async for check
  let content = replyObj.content || '';

  content = cleanCitations(content);

  if (!content || content.length < 15) {
    replyObj.content = "Foi mal, não consegui encontrar uma resposta completa agora. Tente novamente!";
    return replyObj;
  }

  // Hallucination check
  const hasHallucination = await checkHallucination(content, incoming);
  if (hasHallucination) {
    content = "Desculpe, detectei algo incerto na resposta. Aqui vai uma versão segura: Consulte fontes oficiais como o site do governo para detalhes precisos. Dica do Zazil: Com paciência, tudo se resolve!";
  }

  if (!/dica do zazil/i.test(content)) {
    content += '\n\nDica do Zazil: Com jeitinho brasileiro, tudo se resolve – volte sempre!';
  }

  content = dedupeDicas(content);

  replyObj.content = content;
  return replyObj;
};