// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção. Classifique a mensagem do usuário em uma das seguintes categorias:

- fx: se estiver perguntando sobre câmbio, dólar, valor financeiro, ou comparação com real
- event: se estiver perguntando o que fazer, eventos, jogos, shows, festas ou planos locais
- news: se estiver perguntando o que está acontecendo no mundo, no Brasil ou atualidades
- amazon: se estiver perguntando onde comprar, quanto custa, ou pedindo recomendações de produtos (raquete, panela, tênis, Alexa, etc)
- cancel: se estiver tentando cancelar, sair ou encerrar o plano do Zazil
- generic: se for qualquer outra coisa, como perguntas gerais, tradução, conselhos, curiosidades ou piadas
`;

const functions = [{
  name: 'classify_intent',
  description: 'Classifica a intenção do usuário.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['fx', 'event', 'news', 'cancel', 'amazon', 'generic'],
        description: 'A intenção principal da mensagem do usuário'
      }
    },
    required: ['intent']
  }
}];

/**
 * Keyword fallback: tries to guess intent from common patterns.
 */
function fallbackIntent(userText) {
  const text = userText.toLowerCase();
  if (/(comprar|preço|quanto custa|amazon|produto|onde encontro|onde vende|tem no amazon|quanto está)/i.test(text)) {
    return 'AMAZON';
  }
  if (/(câmbio|cotação|dólar|usd|brl|real)/i.test(text)) {
    return 'FX';
  }
  if (/(evento|festa|show|jogo|agenda|balada|o que fazer)/i.test(text)) {
    return 'EVENT';
  }
  if (/(notícia|acontecendo|novidade|atualidade|hoje)/i.test(text)) {
    return 'NEWS';
  }
  if (/(cancelar|cancelamento|cancel|unsubscribe|parar assinatura|sair do zazil)/i.test(text)) {
    return 'CANCEL';
  }
  return 'GENERIC';
}

async function classifyIntent(userText) {
  let intent = 'GENERIC';
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
    if (args) {
      intent = JSON.parse(args).intent.toUpperCase();
    } else {
      intent = fallbackIntent(userText);
      console.warn('[classifyIntent] No function_call.arguments returned, fallback to:', intent);
    }
  } catch (err) {
    console.error('[classifyIntent] error:', err);
    intent = fallbackIntent(userText);
  }
  console.log('[classifyIntent] Final intent:', intent);
  return intent;
}

module.exports = classifyIntent;