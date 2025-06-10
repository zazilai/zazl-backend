// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção para um assistente brasileiro no WhatsApp.
Sua tarefa é analisar a mensagem do usuário e responder apenas com UMA destas intenções (em maiúsculas):

- NEWS: se a pessoa pergunta sobre fatos, pessoas, eventos atuais, notícias, acontecimentos, resultados de jogos, situação atual, nomes de políticos, times, atualidades, "quem é", "quanto está", etc.
- FX: se for sobre dólar, câmbio, cotação ou comparação de moeda.
- EVENT: se for sobre eventos, festas, shows, jogos futuros, "o que fazer", "o que tem pra fazer", programação, onde ir.
- AMAZON: se for sobre comprar, preços, produtos, recomendações de itens, lojas, "onde compro", "quanto custa".
- CANCEL: se for sobre cancelar plano, assinatura, sair, encerrar, "cancelar Zazil".
- GENERIC: para tudo o resto (ex: dúvidas gerais, traduções, dicas de vida, conselhos, curiosidades, piadas, desabafos, saudações, perguntas pessoais, etc).

Mensagem do usuário: "{user}"
Responda APENAS com uma palavra: NEWS, FX, EVENT, AMAZON, CANCEL ou GENERIC.
`;

async function classifyIntent(userText) {
  const prompt = SYSTEM_PROMPT.replace('{user}', userText);
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 1,
    messages: [
      { role: 'system', content: prompt }
    ]
  });

  const intent = resp.choices?.[0]?.message?.content?.trim().toUpperCase();
  // Always default to GENERIC to avoid crashes
  if (['NEWS', 'FX', 'EVENT', 'AMAZON', 'CANCEL', 'GENERIC'].includes(intent)) {
    return intent;
  }
  return 'GENERIC';
}

module.exports = classifyIntent;