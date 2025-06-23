// helpers/groovoo.js

const axios = require('axios');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Uses OpenAI to extract the city from a user's query.
 * If fails, fallback to basic regex or keyword detection.
 */
async function extractCityFromQuery(query) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: 'system',
          content: `Sua tarefa é extrair o nome da cidade ou localidade da pergunta do usuário. Se não houver cidade, responda só com "". Exemplos:
"Quais eventos em Boston?" → "Boston"
"Eventos hoje em Fort Lauderdale?" → "Fort Lauderdale"
"Tem festa brasileira em Miami?" → "Miami"
"Quais eventos?" → ""`
        },
        { role: 'user', content: query }
      ]
    });
    let city = response.choices?.[0]?.message?.content?.replace(/"/g, '').trim();
    // Defensive: blank/generic responses like "EUA" or "" mean try fallback
    if (!city || city.toLowerCase() === 'eua' || city.length < 2) {
      // Try a fallback: regex for major US cities in the message
      const possible = query.match(/(?:em|in)\s+([A-Za-zÀ-ú\s]+)/i);
      if (possible && possible[1]) return possible[1].trim();
      // Or try a hard-coded minimal fallback for Miami, Austin, etc.
      const known = ['miami', 'orlando', 'fort lauderdale', 'houston', 'worcester', 'austin', 'san francisco'];
      const found = known.find(city => query.toLowerCase().includes(city));
      if (found) return found.charAt(0).toUpperCase() + found.slice(1);
      return '';
    }
    return city;
  } catch (err) {
    console.error('[Groovoo] City extraction via OpenAI failed:', err);
    // Fallback: Try regex
    const possible = query.match(/(?:em|in)\s+([A-Za-zÀ-ú\s]+)/i);
    if (possible && possible[1]) return possible[1].trim();
    return '';
  }
}

/**
 * Normalizes a string for loose city matching.
 */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '')         // Remove punctuation
    .trim();
}

/**
 * Fetches and filters events from Groovoo API.
 * Returns up to 10 soonest events for that city (if found), or all events if not.
 */
async function getEvents(message) {
  const searchCity = await extractCityFromQuery(message);
  console.log('[Groovoo] Search city extracted:', searchCity);

  let events = [];
  try {
    const { data } = await axios.get('https://api.groovoo.io/ticketing_events');
    if (!Array.isArray(data)) throw new Error('Groovoo API: Unexpected response');
    events = data;
  } catch (err) {
    console.error('[Groovoo] API error:', err.message);
    return { events: [], error: true };
  }

  // DEBUG: List first 10 event cities for reference
  console.log(
    '[Groovoo] First 10 event cities:',
    events.slice(0, 10).map(e => ({
      city: e.address?.city,
      local_name: e.address?.local_name
    }))
  );

  let filtered = events;
  if (searchCity) {
    const normSearch = normalize(searchCity);
    filtered = events.filter(e => {
      const eventCity = normalize(e.address?.city);
      const localName = normalize(e.address?.local_name);
      const found = eventCity.includes(normSearch) || localName.includes(normSearch);
      if (found) {
        console.log(`[Groovoo] MATCH: Query [${normSearch}] matched with event city [${eventCity}] or local_name [${localName}]`);
      }
      return found;
    });
  }

  // Sort by start date (soonest first)
  filtered = filtered.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return { events: filtered.slice(0, 10), error: false };
}

module.exports = { getEvents };