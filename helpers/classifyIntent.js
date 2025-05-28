// helpers/classifyIntent.js
require('dotenv').config();
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Ask GPT to classify the user’s text into one of 4 intents.
 */
module.exports = async function classifyIntent(text = '') {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `Você é um detector de intenção.
Responda apenas pelo nome de uma das intenções:
• EVENT para perguntas sobre eventos
• FX    para cotações de moeda (dólar/euro)
• NEWS  para notícias
• GENERIC para todo o resto`
      },
      { role: 'user', content: text }
    ]
  });
  const intent = resp.choices[0].message.content.trim().toUpperCase();
  return ['EVENT','FX','NEWS','GENERIC'].includes(intent) ? intent : 'GENERIC';
};
