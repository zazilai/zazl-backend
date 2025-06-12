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
Você é um assistente de IA que EXTRAI dados úteis do usuário a cada nova mensagem, para um contexto de memória curta.
Sempre que encontrar um dado objetivo novo (nome, cidade, profissão, data, hobby, interesse, aniversário, etc), adicione à lista. Se já estiver no resumo anterior, mantenha. JAMAIS deixe em branco se a mensagem contiver qualquer dado.
- Retorne tudo como uma frase ou lista curta, no máximo 3 linhas.
- Se NÃO houver absolutamente nenhum dado útil (ex: só "ok", "obrigado", etc), devolva o resumo anterior.
Exemplos:

Resumo atual:
Pedro mora em Austin.

Nova mensagem:
Sou engenheiro. Gosto de futebol.

Resumo atualizado:
Pedro mora em Austin. Profissão: engenheiro. Gosta de futebol.

Resumo atual:


Nova mensagem:
Meu nome é Maria, moro em Miami, adoro culinária.

Resumo atualizado:
Nome: Maria. Mora em Miami. Gosta de culinária.

Resumo atual:
João, professor em Boston.

Nova mensagem:
Faço aniversário em 10 de maio.

Resumo atualizado:
João, professor em Boston. Aniversário: 10 de maio.

Agora, use esse padrão para atualizar:
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'o3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resumo atual:\n${oldSummary || ''}\n\nNova mensagem:\n${userMessage}\n\nResumo atualizado:` }
      ]
    });

    const content = response.choices?.[0]?.message?.content?.trim() || '';
    console.log('[MEMORY] Old:', oldSummary);
    console.log('[MEMORY] Incoming:', userMessage);
    console.log('[MEMORY] New:', content);

    // Store only if content is not empty and not exactly equal to oldSummary
    if (content && content !== oldSummary) {
      return content;
    }
    return oldSummary || '';
  } catch (err) {
    console.error('[MEMORY] Error in updateUserSummary:', err);
    return oldSummary || '';
  }
}

module.exports = { updateUserSummary };