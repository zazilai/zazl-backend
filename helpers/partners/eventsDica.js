// helpers/partners/eventsDica.js — Enhanced with Web Fallback & RAG

const axios = require('axios');
const cheerio = require('cheerio');
const perplexityService = require('../perplexity');
const extractCityFromText = require('../utils/extractCityFromText');

// Ticketmaster integration
const ticketmaster = {
  async getEvents(city) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      console.warn('[Ticketmaster] Missing API_KEY');
      return [];
    }
    try {
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&city=${encodeURIComponent(city)}&keyword=brazilian&sort=date,asc&size=5`;
      const res = await axios.get(url, { timeout: 5000 });
      if (!res.data._embedded?.events) return [];
      return res.data._embedded.events.map(event => ({
        name: event.name,
        date: event.dates?.start?.dateTime,
        location: event._embedded?.venues?.[0]?.name,
        city: event._embedded?.venues?.[0]?.city?.name,
        url: event.url
      }));
    } catch (e) {
      console.error('[Ticketmaster] Error:', e.message);
      return [];
    }
  }
};

// Web search fallback using Perplexity (RAG approach)
async function webSearchFallback(city) {
  try {
    console.log(`[EventsDica] Trying web fallback for ${city}`);
    
    // Use Perplexity with targeted query
    const searchQuery = `Brazilian events happening in ${city} this week or month. Include specific dates, venues, and ticket links if available. Focus on Meetup, Eventbrite, Facebook events.`;
    
    const { answer } = await perplexityService.search(searchQuery, city);
    
    if (!answer || answer.length < 50) return [];
    
    // Parse events from answer using AI
    try {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: `Extract events from text. Return JSON array with max 3 events:
[{
  "name": "event name",
  "date": "YYYY-MM-DD or date string",
  "location": "venue name",
  "city": "${city}",
  "url": "ticket/info URL if found"
}]
Return empty array if no specific events found.`
          },
          {
            role: 'user',
            content: answer
          }
        ]
      });
      
      const events = JSON.parse(response.choices[0].message.content);
      return Array.isArray(events) ? events.slice(0, 3) : [];
    } catch (parseError) {
      console.error('[EventsDica] Parse error:', parseError);
      return [];
    }
  } catch (e) {
    console.error('[EventsDica] Web fallback error:', e);
    return [];
  }
}

// Normalize city name
function normalizeCity(city = '') {
  return city.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Format single event (concise for WhatsApp)
function formatEvent(evt) {
  const name = evt.name || 'Evento';
  const dateStr = evt.date || evt.start_at || '';
  const venue = evt.location || evt.venue || '';
  const link = evt.url || '';
  
  let formatted = `🎫 *${name}*`;
  
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        formatted += `\n📅 ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`;
      }
    } catch {
      formatted += `\n📅 ${dateStr}`;
    }
  }
  
  if (venue) formatted += `\n📍 ${venue}`;
  if (link) formatted += `\n🔗 ${link.length > 40 ? link.substring(0, 37) + '...' : link}`;
  
  return formatted;
}

// Format as Dica do Zazil (always consistent format)
function formatAsDica(events, city, memoryContext) {
  if (!events || events.length === 0) {
    return `💡 Dica do Zazil: Não achei eventos brasileiros específicos em ${city} agora, mas confira:\n• Facebook: "Brasileiros em ${city}"\n• Meetup.com: Busque "Brazilian"\n• Instagram: Siga páginas locais\n\nNovidades aparecem toda semana! 🎉`;
  }
  
  // Sort by date and take top 3
  const sorted = events
    .filter(e => e.name) // Must have name
    .sort((a, b) => {
      const dateA = new Date(a.date || a.start_at || '9999');
      const dateB = new Date(b.date || b.start_at || '9999');
      return dateA - dateB;
    })
    .slice(0, 3);
  
  let dica = `💡 Dica do Zazil: `;
  
  // Add memory-aware intro if relevant
  if (memoryContext && memoryContext.includes('eventos')) {
    dica += `Lembrei que você curte eventos! `;
  }
  
  dica += `Próximos em ${city}:\n\n`;
  
  sorted.forEach((evt, idx) => {
    dica += formatEvent(evt);
    if (idx < sorted.length - 1) dica += '\n\n';
  });
  
  dica += '\n\n💚 Chegue cedo e convide amigos!';
  
  return dica;
}

// Groovoo API
async function getGroovooEvents(city) {
  try {
    const res = await axios.get('https://api.groovoo.io/ticketing_events', { timeout: 5000 });
    let events = Array.isArray(res.data) ? res.data : [];
    if (city) {
      const normCity = normalizeCity(city);
      events = events.filter(evt => normalizeCity(evt?.address?.city) === normCity);
    }
    return events.map(evt => ({
      name: evt.name,
      date: evt.start_at,
      location: evt.address?.local_name,
      city: evt.address?.city,
      url: evt.external_shop_url || evt.instagram_link
    }));
  } catch (e) {
    console.error('[Groovoo] Error:', e.message);
    return [];
  }
}

// Meetup scraper
async function getMeetupEvents(city) {
  try {
    const url = `https://www.meetup.com/find/events/?keywords=brazilian&location=us--${normalizeCity(city)}`;
    const res = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(res.data);
    const events = [];
    
    $('[data-testid="event-card"]').each((i, el) => {
      if (i >= 3) return false;
      const name = $(el).find('[data-testid="event-card-name"]').text().trim();
      const date = $(el).find('[data-testid="event-card-date"]').text().trim();
      const location = $(el).find('[data-testid="event-card-location"]').text().trim();
      const href = $(el).find('a').attr('href');
      
      if (name) {
        events.push({
          name,
          date,
          location,
          city,
          url: href ? `https://www.meetup.com${href}` : ''
        });
      }
    });
    
    return events;
  } catch (e) {
    console.error('[Meetup] Error:', e.message);
    return [];
  }
}

// Main entry point
module.exports = async function eventsDica(message, userCity, userContext, source) {
  // Only run for event queries
  if (source !== 'TOOL_CALL' && source !== 'EVENT' && 
      !/\b(evento|agenda|show|balada|festa|programa|o que fazer|events?)\b/i.test(message)) {
    return '';
  }
  
  // Extract city from various sources
  let city = userCity;
  
  if (!city) {
    city = await extractCityFromText(message);
  }
  
  if (!city && userContext) {
    const match = userContext.match(/(?:moro em|vivo em|cidade:\s*)([A-Za-zÀ-ÿ\s]+?)(?:[,.]|$)/i);
    if (match) city = match[1].trim();
  }
  
  if (!city) {
    return '💡 Dica do Zazil: Me diga sua cidade para encontrar eventos brasileiros personalizados! 😊';
  }
  
  console.log(`[EventsDica] Searching events in ${city}`);
  
  // Try sources in order (fastest first)
  let allEvents = [];
  
  // Parallel fetch for speed
  const [groovoo, ticketmaster, meetup] = await Promise.all([
    getGroovooEvents(city).catch(() => []),
    ticketmaster.getEvents(city).catch(() => []),
    getMeetupEvents(city).catch(() => [])
  ]);
  
  allEvents = [...groovoo, ...ticketmaster, ...meetup];
  
  // If no events found, try web fallback
  if (allEvents.length === 0) {
    console.log(`[EventsDica] No API events, trying web fallback`);
    allEvents = await webSearchFallback(city);
  }
  
  // Remove duplicates by name
  const uniqueEvents = [];
  const seen = new Set();
  
  for (const evt of allEvents) {
    const key = evt.name?.toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueEvents.push(evt);
    }
  }
  
  // Always return formatted dica
  return formatAsDica(uniqueEvents, city, userContext);
};