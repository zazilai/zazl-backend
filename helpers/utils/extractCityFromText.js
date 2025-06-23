// helpers/utils/extractCityFromText.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Uses OpenAI to extract a valid US city from a user's query.
 * If not found, returns ''.
 */
async function extractCityFromText(text) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 12,
      messages: [
        {
          role: 'system',
          content: `Extraia APENAS o nome da cidade dos EUA (sem estado/país), se houver, da pergunta do usuário. Só a cidade, ou "" se não houver.
Exemplos:
"Eventos brasileiros em Miami?" → "Miami"
"Quais eventos em Boston?" → "Boston"
"Eventos hoje em Fort Lauderdale?" → "Fort Lauderdale"
"Tem festa brasileira em Houston?" → "Houston"
"Quais eventos?" → ""`
        },
        { role: 'user', content: text }
      ]
    });
    const city = response.choices?.[0]?.message?.content?.replace(/"/g, '').trim();
    if (!city || city.match(/eua|usa|estados unidos|united states|^$/i)) return '';
    if (city.length > 32) return '';
    return city;
  } catch (err) {
    console.error('[extractCityFromText] Error:', err);
    return '';
  }
}

module.exports = extractCityFromText;