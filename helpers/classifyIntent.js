const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
You are an intent classifier. Classify the user's message into one of the following intents:

- fx: if it's asking about currency, dollar exchange rate, or financial value
- event: if it's asking what to do, events, shows, or local plans
- news: if it's asking what's happening in the world, Brazil, or general updates
- generic: if it's anything else, like a question, translation, joke, or random curiosity
`;

const functions = [{
  name: 'classify_intent',
  description: 'Classifies user input into one of four supported intents.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['fx', 'event', 'news', 'generic'],
        description: 'The type of user intent'
      }
    },
    required: ['intent']
  }
}];

async function classifyIntent(userText) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText }
    ],
    functions,
    function_call: { name: 'classify_intent' }
  });

  const args = response.choices[0].message.function_call.arguments;
  return JSON.parse(args).intent.toUpperCase(); // returns 'FX', 'EVENT', etc.
}

module.exports = classifyIntent;