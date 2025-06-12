// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção para o assistente Zazil.

Classifique a mensagem do usuário em UMA destas categorias:
- fx: Perguntas sobre câmbio, dólar, valor do real/dólar, ou envio de dinheiro.
- event: Perguntas sobre shows, festas, datas de jogos, “eventos brasileiros”, “agenda”, “o que fazer”, programação, balada, atrações, eventos culturais — especialmente se envolver local/cidade/país ou contexto de data.
- news: Perguntas sobre notícias, atualidades, o que está acontecendo, novidades.
- amazon: Perguntas sobre produtos físicos, onde comprar, quanto custa um produto, recomendações de itens para comprar (ex: raquete, panela, Alexa, etc).
- service_cost: Perguntas sobre preço/custo de serviços ou mão de obra (conserto, corte de cabelo, dentista, mecânico, instalação, manutenção, etc).
- copywriting: Pedidos para melhorar texto, revisar legenda, criar post, ajustar frase para Instagram, LinkedIn, email, etc.
- cancel: Se estiver tentando cancelar ou encerrar o plano do Zazil, cancelar assinatura.
- generic: Qualquer outra coisa (traduções, conselhos, curiosidades, dúvidas gerais).

EXEMPLOS:
Q: "Quando é o próximo evento brasileiro em Miami?"
A: event

Q: "Quais as melhores festas brasileiras nos EUA este mês?"
A: event

Q: "Quais os próximos eventos importantes brasileiros nos EUA?"
A: event

Q: "Quais as notícias de hoje no Brasil?"
A: news

Q: "Quanto custa uma raquete de tênis?"
A: amazon

Q: "Quanto custa trocar o freio de uma Suburban?"
A: service_cost

Q: "Me ajuda a melhorar esse post do Instagram:"
A: copywriting

Q: "Como cancelo minha assinatura do Zazil?"
A: cancel

Q: "Me conte uma curiosidade sobre a Flórida."
A: generic
`;

const functions = [{
  name: 'classify_intent',
  description: 'Classifica a intenção do usuário.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['fx', 'event', 'news', 'amazon', 'service_cost', 'copywriting', 'cancel', 'generic'],
        description: 'A intenção principal da mensagem do usuário'
      }
    },
    required: ['intent']
  }
}];

async function classifyIntent(userText) {
  try {
    const response = await openai.chat.completions.create({
      model: 'o3',
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