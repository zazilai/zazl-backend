// helpers/grok.js — OpenAI-Compatible Integration for Grok 4 (July 2025, No New NPM)

const { OpenAI } = require('openai');

const grokClient = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

async function getGrokResponse(messages, model = 'grok-4') {
  try {
    const response = await grokClient.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('[Grok] Error:', err);
    return null; // Trigger fallback in index.cjs
  }
}

module.exports = { getGrokResponse };