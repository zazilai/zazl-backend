// helpers/marketplaceDica.js — Fixed Reliability, Variety, No Duplicates (July 2025)

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica');
const ticketmaster = require('./ticketmaster'); // Now used as fallback
const axios = require('axios');

// Eventbrite fallback function (add EVENTBRITE_API_KEY to env)
async function getEventbriteEvents(query, city) {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) return [];
  try {
    const res = await axios.get(`https://www.eventbriteapi.com/v3/events/search/?q=${query} brazilian&location.address=${city}&token=${key}`, { timeout: 5000 });
    return (res.data.events || []).slice(0, 3).map(e => ({
      name: e.name.text,
      start_at: e.start.local,
      address: { city, local_name: e.venue?.name || '' },
      external_shop_url: e.url
    }));
  } catch (e) {
    console.error('[Eventbrite] Error:', e);
    return [];
  }
}

// Updated events orchestrator with fallbacks and retries
async function getEventsWithFallback(message, city) {
  let events = [];
  // Try Groovoo with retry
  for (let i = 0; i < 2; i++) {
    try {
      events = await eventsDica.getEventsFromGroovoo(city); // Assume you add this to eventsDica.js
      if (events.length) return events;
    } catch {}
  }
  // Fallback Ticketmaster
  events = await ticketmaster.getEvents(city);
  if (events.length) return events;
  // Fallback Eventbrite
  return await getEventbriteEvents(message, city);
}

const dicaVariationPrompt = `Gere uma "Dica do Zazil" variada, personalizada e não genérica baseada no contexto. Use cidade/interesses se disponíveis. Evite repetições. Ex: Para eventos em Austin, "Dica do Zazil: Em Austin, eventos brasileiros no Groovoo são perfeitos para matar a saudade – confira!"`;

module.exports = async function getMarketplaceDica({ message, city, context, intent }) {
  let dica = '';

  // Single Dica logic: Prioritize and return only one
  if (intent === 'AMAZON') {
    dica = await amazonDica(message, city, context, intent);
  } else if (intent === 'EVENT') {
    const events = await getEventsWithFallback(message, city);
    if (events.length) {
      dica = eventsDica.formatEvents(events, city); // Assume format function in eventsDica
    }
  } else if (intent === 'FX') {
    dica = await remitlyDica(message, city, context, intent);
  }

  // If no specific, or to vary generic, use AI
  if (!dica || dica.length < 20) {
    const variaRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 100,
      messages: [{ role: 'system', content: dicaVariationPrompt },
                { role: 'user', content: `Contexto: ${context || ''}. Cidade: ${city || ''}. Mensagem: ${message}` }]
    });
    dica = variaRes.choices[0].message.content.trim();
  }

  return dica; // Single string, no arrays/duplicates
};