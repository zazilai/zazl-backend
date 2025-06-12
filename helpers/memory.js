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
Você é um assistente de extração de dados de usuário para contexto de IA.
Extraia e liste todos os dados relevantes, SEMPRE, em até 3 linhas, mesmo se forem poucos (nome, cidade, profissão, eventos, interesses, datas importantes, preferências, etc).
Só mantenha vazio se NÃO houver absolutamente nenhuma informação relevante.
Não invente nada e nunca resuma demais: apenas extraia informações factuais.
Se não houver informações úteis, devolva exatamente a string recebida em "Resumo atual".
Exemplo:
Resumo atual:
Pedro mora em Austin.

Nova mensagem:
Eu gosto de futebol e sou engenheiro.

Resumo atualizado:
Pedro mora em Austin. Gosta de futebol. Profissão: engenheiro.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'o3',
      max_completion_tokens: 100,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resumo atual:\n${oldSummary || ''}\n\nNova mensagem:\n${userMessage}\n\nResumo atualizado:` }
      ]
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    console.log('[MEMORY] Old:', oldSummary);
    console.log('[MEMORY] Incoming:', userMessage);
    console.log('[MEMORY] New:', content);

    if (content && content !== oldSummary && content.length > 1) {
      return content;
    } else {
      return oldSummary || '';
    }
  } catch (err) {
    console.error('[MEMORY] Error in updateUserSummary:', err);
    return oldSummary || '';
  }
}

module.exports = { updateUserSummary };