// helpers/utils/extractCityFromText.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanQueryForCity(text) {
  return text
    .replace(/eventos? em\s*/i, '')
    .replace(/show[s]? em\s*/i, '')
    .replace(/balada[s]? em\s*/i, '')
    .replace(/festa[s]? em\s*/i, '')
    .replace(/o que fazer em\s*/i, '')
    .replace(/\?/g, '')
    .trim();
}

async function extractCityFromText(text) {
  const cleaned = cleanQueryForCity(text);
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content: `Retorne somente o nome da cidade dos EUA (sem estado/país) a partir da frase abaixo, ou "" se não houver. Exemplo:
"Eventos brasileiros em Miami?" → "Miami"
"Quais eventos em Boston?" → "Boston"
"Eventos hoje em Fort Lauderdale?" → "Fort Lauderdale"
"Tem festa brasileira em Houston?" → "Houston"
"Quais eventos?" → ""`
        },
        { role: 'user', content: cleaned }
      ]
    });
    let city = response.choices?.[0]?.message?.content?.replace(/"/g, '').trim();
    if (!city || city.match(/eua|usa|estados unidos|united states|^$/i)) return '';
    if (!/^[a-zA-ZÀ-ÿ\s\-]{2,32}$/.test(city)) return '';
    city = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return city;
  } catch (err) {
    console.error('[extractCityFromText] Error:', err);
    return '';
  }
}

module.exports = extractCityFromText;