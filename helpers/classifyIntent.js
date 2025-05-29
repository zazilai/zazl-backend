// helpers/classifyIntent.js
require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Ask GPT to classify the user’s text into one of 4 intents.
 * Returns exactly 'EVENT', 'FX', 'NEWS' or 'GENERIC'
 */
module.exports = async function classifyIntent(text = '') {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `
You are an intent detector.
Answer with exactly one of:
• EVENT   – for questions about events
• FX      – for currency quotes (dólar/euro)
• NEWS    – for news digests
• GENERIC – everything else`
      },
      { role: 'user', content: text }
    ]
  });

  const intent = resp.choices[0].message.content.trim().toUpperCase();
  if (['EVENT','FX','NEWS','GENERIC'].includes(intent)) {
    return intent;
  }
  return 'GENERIC';
};
