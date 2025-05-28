/**
 * GPT-4o–mini intent classifier (EVENT | FX | NEWS | GENERIC)
 * – Small prompt (⩽30 tokens) → cost is tiny.
 * – No conversation state stored here; index.cjs still decides what to do.
 */

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* Function “signature” we want GPT to pick */
const functions = [
  {
    name: 'set_intent',
    description: 'Classify the user message into a high-level intent.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['EVENT', 'FX', 'NEWS', 'GENERIC']
        }
      },
      required: ['intent']
    }
  }
];

module.exports = async (text = '') => {
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 1,
    messages: [
      {
        role: 'system',
        content:
          'Classifique a mensagem do usuário em EVENT, FX, NEWS ou GENERIC. ' +
          '• EVENT = pergunta sobre shows/festas/eventos; ' +
          '• FX = cotação de dólar/euro; ' +
          '• NEWS = quer notícias/atualizações; ' +
          '• GENERIC = qualquer outra coisa. ' +
          'Responda usando a função set_intent apenas.'
      },
      { role: 'user', content: text }
    ],
    functions,
    function_call: { name: 'set_intent' }
  });

  /* Extract the enum value from the tool call */
  try {
    const tool = chat.choices[0].message.function_call;
    const { intent } = JSON.parse(tool.arguments);
    return intent || 'GENERIC';
  } catch {
    return 'GENERIC';
  }
};
