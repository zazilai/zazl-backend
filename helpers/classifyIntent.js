// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção para o assistente Zazil. Classifique cada mensagem do usuário em **UMA** das categorias abaixo:

- fx
- news
- service_cost
- copywriting
- cancel
- generic

REGRAS:
- Use "copywriting" para pedidos de melhorar/criar/revisar textos (mesmo que mencionem eventos/produtos/notícias).
- Use "fx" apenas para perguntas de câmbio/dólar/envio de dinheiro.
- Use "service_cost" para pedidos de preço/custo de serviço/mão de obra.
- Use "cancel" só para pedidos claros de cancelar assinatura/plano.
- Use "news" para perguntas sobre notícias, atualidades, acontecimentos recentes.
- Use "generic" para TODO O RESTANTE, incluindo perguntas de produtos, eventos, curiosidades etc.
`;

const functions = [{
  name: 'classify_intent',
  description: 'Classifica a intenção do usuário.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [
          'fx',
          'news',
          'service_cost',
          'copywriting',
          'cancel',
          'generic'
        ],
        description: 'A intenção principal da mensagem do usuário'
      }
    },
    required: ['intent']
  }
}];

async function classifyIntent(userText) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0.3,
      max_completion_tokens: 10,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText }
      ],
      functions,
      function_call: { name: 'classify_intent' }
    });

    const args = response.choices?.[0]?.message?.function_call?.arguments;
    if (!args) return 'GENERIC';
    const intent = JSON.parse(args).intent.toUpperCase();
    console.log('[classifyIntent] intent:', intent);
    return intent;
  } catch (err) {
    console.error('[classifyIntent] error:', err);
    return 'GENERIC';
  }
}

module.exports = classifyIntent;