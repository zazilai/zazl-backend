// helpers/classifyIntent.js
require('dotenv').config();
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Ask GPT to classify the user's text into one of 4 intents.
 * Returns exactly 'EVENT', 'FX', 'NEWS' or 'GENERIC'.
 */
module.exports = async function classifyIntent(text = '') {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 3,
    messages: [
      {
        role: 'system',
        content: `Você é um detector de intenção. Responda apenas com o nome de uma das intenções (em MAIÚSCULAS):
• EVENT para perguntas sobre eventos
• FX para cotações de moeda (dólar/euro)
• NEWS para notícias
• GENERIC para todo o resto`
      },
      { role: 'user', content: text }
    ]
  });

  // pull out GPT's single-token reply, default to GENERIC on anything unexpected
  const raw = resp.choices?.[0]?.message?.content?.trim().toUpperCase();
  return ['EVENT','FX','NEWS','GENERIC'].includes(raw) ? raw : 'GENERIC';
};
