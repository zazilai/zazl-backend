// helpers/memory.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `
Você é um assistente de IA que mantém apenas dados PESSOAIS e PERMANENTES do usuário (nome, cidade, profissão, interesses fixos, datas especiais). NÃO registre buscas, compras, perguntas ou interesses momentâneos (ex: eventos, produtos, notícias). 
Quando a mensagem trouxer novo dado pessoal, atualize; caso contrário, mantenha o resumo anterior.
Retorne o resumo em uma linha curta, em linguagem natural. Ex:
Resumo atual:
Pedro mora em Austin.

Nova mensagem:
Sou engenheiro, aniversário em 10/10.

Resumo atualizado:
Pedro mora em Austin. Profissão: engenheiro. Aniversário: 10/10.
`;

async function updateUserSummary(oldSummary, userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 60,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resumo atual:\n${oldSummary || ''}\n\nNova mensagem:\n${userMessage}\n\nResumo atualizado:` }
      ]
    });

    const content = response.choices?.[0]?.message?.content?.trim() || '';
    // Defensive: never replace with blank, never let search-y queries override real memory
    if (content && content !== oldSummary && !/^quais|como|onde|eventos|comprar|tem\b/i.test(userMessage)) {
      return content;
    }
    return oldSummary || '';
  } catch (err) {
    console.error('[MEMORY] Error in updateUserSummary:', err);
    return oldSummary || '';
  }
}

module.exports = { updateUserSummary };