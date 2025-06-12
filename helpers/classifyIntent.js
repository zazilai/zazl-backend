// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*
████████████████████████████████████████████████████████████████
 ZAZIL INTENT CLASSIFIER – SYSTEM PROMPT (2025-06)
████████████████████████████████████████████████████████████████
• Returns only: fx, event, news, amazon, service_cost, copywriting, cancel, generic.
• Only LLM; no fallback keyword hacks.
• Designed to minimize wrong intent for copywriting vs events vs generic.
*/

const SYSTEM_PROMPT = `
Você é um classificador de intenção para o assistente Zazil. Sua missão é classificar cada mensagem do usuário, sempre em **UMA** das categorias abaixo (exatamente como está escrito):

- fx: Perguntas sobre câmbio, dólar, cotação, envio de dinheiro ou taxas de câmbio.
- event: Pedidos sobre festas, shows, eventos brasileiros, programação, agenda, datas de jogos, baladas, atrações, “o que fazer”, principalmente se mencionar local/cidade/país ou datas.
- news: Perguntas sobre notícias, atualidades, fatos recentes, acontecimentos, manchetes.
- amazon: Pedidos de produto físico, onde comprar, quanto custa, recomendações de itens (raquete, Alexa, panela, tênis, Airfryer, etc).
- service_cost: Pedidos de preço/custo de serviços ou mão de obra (conserto, corte de cabelo, dentista, mecânico, instalação, manutenção, etc).
- copywriting: Pedidos para melhorar, revisar, reescrever, ajustar, criar, sugerir ou traduzir textos/frases, legendas, posts, e-mails, mensagens de aniversário, posts para Instagram/LinkedIn, roteiros, convites, resumos, slogans, respostas para clientes, etc.
- cancel: Tentativas de cancelar, encerrar plano, cancelar assinatura do Zazil.
- generic: Tudo o que não se encaixar claramente nas anteriores (perguntas gerais, curiosidades, conselhos, traduções, dicas de viagem, dúvidas pessoais, etc).

REGRAS GERAIS:
1. Sempre escolha só UMA categoria.
2. “Copywriting” deve ser escolhida sempre que o usuário pede para revisar, melhorar, ajustar, criar, reescrever ou sugerir texto, mesmo que mencione eventos, produtos, ou notícias dentro do texto.
3. "Event" é só para quando a pessoa claramente pede lista/agenda de eventos, festas, programação, datas, shows, jogos — nunca para melhorar frases de convite, post ou legenda (nesse caso é copywriting).
4. Ignore hashtags ou emojis; foque na intenção principal do pedido.
5. "Cancel" é apenas para pedidos claros de cancelar/desfazer assinatura/plano.

EXEMPLOS:
Q: “Quando é o próximo evento brasileiro em Miami?”  
A: event

Q: “Quais os próximos eventos importantes brasileiros nos EUA?”  
A: event

Q: “Pode me ajudar a melhorar essa legenda para Instagram? 1 ano morando em Austin…”  
A: copywriting

Q: “Melhora esse texto para LinkedIn:”  
A: copywriting

Q: “Quanto custa trocar o freio de uma Suburban?”  
A: service_cost

Q: “Como cancelo minha assinatura do Zazil?”  
A: cancel

Q: “Me conte uma curiosidade sobre a Flórida.”  
A: generic

Q: “Quais as notícias de hoje no Brasil?”  
A: news

Q: “Quanto custa uma Airfryer?”  
A: amazon

Se ficar em dúvida, escolha “generic”.
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
          'event',
          'news',
          'amazon',
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