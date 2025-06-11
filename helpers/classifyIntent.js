// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção para o assistente Zazil.

Classifique a mensagem do usuário em UMA destas categorias:

- fx: Perguntas sobre câmbio, dólar, valor do real/dólar, ou envio de dinheiro.
- event: Perguntas sobre eventos, festas, shows, esportes, datas de jogos, o que fazer, etc.
- news: Perguntas sobre notícias, atualidades, o que está acontecendo, novidades.
- amazon: Perguntas sobre produtos físicos, onde comprar, quanto custa um produto, recomendações de itens para comprar, por exemplo: raquete, panela, Alexa, celular, brinquedo, etc.
- service_cost: Perguntas sobre preço/custo de serviços ou mão de obra, como manutenção, instalação, trocar peças de carro, conserto, limpeza, dentista, cortar cabelo, etc.
- cancel: Se estiver tentando cancelar ou encerrar o plano do Zazil, cancelar assinatura.
- generic: Qualquer outra coisa (traduções, conselhos, curiosidades, piadas, dúvidas gerais).

Exemplos:
Q: "Quanto custa uma raquete de tênis?"
A: amazon

Q: "Onde posso comprar uma panela elétrica nos EUA?"
A: amazon

Q: "Qual o preço médio para trocar o freio de uma Suburban?"
A: service_cost

Q: "Quanto custa um corte de cabelo em Miami?"
A: service_cost

Q: "Qual a cotação do dólar?"
A: fx

Q: "Como cancelo minha assinatura do Zazil?"
A: cancel

Q: "Quando a seleção brasileira joga?"
A: event

Q: "Quais as notícias de hoje no Brasil?"
A: news

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
        enum: ['fx', 'event', 'news', 'cancel', 'amazon', 'service_cost', 'generic'],
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
    if (!args) {
      // Soft fallback: keyword override (for critical intents only)
      const q = userText.toLowerCase();
      if (/cancel/.test(q)) return 'CANCEL';
      if (/dólar|cotação|usd|dollar/.test(q)) return 'FX';
      if (/comprar|produto|raquete|panela|onde encontro|amazon/.test(q)) return 'AMAZON';
      if (/preço|custa|serviço|conserto|trocar|instalar|manutenção|mão de obra|cortar cabelo/.test(q)) return 'SERVICE_COST';
      if (/evento|jogo|show|festa|acontece/.test(q)) return 'EVENT';
      if (/notícia|acontecendo|atualidades/.test(q)) return 'NEWS';
      return 'GENERIC';
    }
    const intent = JSON.parse(args).intent.toUpperCase();
    console.log('[classifyIntent] intent:', intent);
    return intent;
  } catch (err) {
    console.error('[classifyIntent] error:', err);
    return 'GENERIC';
  }
}

module.exports = classifyIntent;