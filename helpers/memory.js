// helpers/memory.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Updates a user's memory summary by extracting key facts from their new message.
 * @param {string} oldSummary - Previous summary string.
 * @param {string} userMessage - The latest message from the user.
 * @returns {Promise<string>} - New summary string.
 */
async function updateUserSummary(oldSummary, userMessage) {
  const systemPrompt = `
Você é um assistente que resume dados do usuário.
- Extraia dados úteis das mensagens (nome, cidade, profissão, eventos, interesses, datas importantes, preferências, etc.).
- Atualize o resumo, sem inventar, em até 3 linhas.
- Se nada for relevante, mantenha igual ou deixe vazio.
`;

  const response = await openai.chat.completions.create({
    model: 'o3',
    max_completion_tokens: 100,
    temperature: 1, // safest for o3 or 4o
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Resumo atual:\n${oldSummary || ''}\n\nNova mensagem:\n${userMessage}\n\nResumo atualizado:` }
    ]
  });

  return response.choices?.[0]?.message?.content?.trim() || (oldSummary || '');
}

module.exports = { updateUserSummary };