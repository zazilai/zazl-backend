// helpers/groovoo.js

const axios = require('axios');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * If a city is provided, skip OpenAI extraction.
 */
async function extractCityFromQuery(queryOrCity, skipExtract = false) {
  if (skipExtract) return queryOrCity;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 12,
      messages: [
        {
          role: 'system',
          content: `Extraia APENAS o nome da cidade dos EUA, se houver, da pergunta do usuário, sem país ou estado. Não chute EUA. Se não houver cidade real, responda só com "".
Exemplos:
"Eventos brasileiros em Miami?" → "Miami"
"Quais eventos em Boston?" → "Boston"
"Eventos hoje em Fort Lauderdale?" → "Fort Lauderdale"
"Tem festa brasileira em Houston?" → "Houston"
"Quais eventos?" → ""`
        },
        { role: 'user', content: queryOrCity }
      ]
    });
    const city = response.choices?.[0]?.message?.content?.replace(/"/g, '').trim();
    if (!city || city.match(/eua|usa|estados unidos|united states|^$/i)) return '';
    if (city.length > 20) return '';
    return city;
  } catch (err) {
    console.error('[Groovoo] City extraction via OpenAI failed:', err);
    return '';
  }
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '')         // Remove punctuation
    .trim();
}

async function getEvents(queryOrCity) {
  let city = '';
  let skipExtract = false;
  if (
    typeof queryOrCity === 'string' &&
    queryOrCity.length > 1 &&
    !/\s/.test(queryOrCity) &&
    queryOrCity.match(/^[a-zA-Z\s]+$/)
  ) {
    // Looks like a city name
    city = queryOrCity;
    skipExtract = true;
  } else {
    city = await extractCityFromQuery(queryOrCity, false);
  }
  console.log('[Groovoo] Search city extracted:', city);

  let events = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) throw new Error('Groovoo API: Unexpected response');
    events = data;
  } catch (err) {
    console.error('[Groovoo] API error:', err.message);
    return { events: [], error: true };
  }

  if (events.length) {
    // Debug: Log the first few events' cities
    console.log(
      '[Groovoo] First 10 event cities:',
      events.slice(0, 10).map(e => ({
        city: e.address?.city,
        local_name: e.address?.local_name
      }))
    );
  }

  let filtered = events;
  if (city) {
    const normSearch = normalize(city);
    filtered = events.filter(e => {
      const eventCity = normalize(e.address?.city);
      const localName = normalize(e.address?.local_name);
      return eventCity.includes(normSearch) || localName.includes(normSearch);
    });
  }

  filtered = filtered.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return { events: filtered.slice(0, 10), error: false };
}

module.exports = { getEvents };