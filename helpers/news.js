const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

function sanitizeQuery(raw) {
  // Remove commas and other punctuation except for letters, numbers, and spaces
  return raw.replace(/[,\|]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function extractNewsTopics(userQuery) {
  try {
    const prompt = `
A partir da pergunta abaixo, extraia apenas as pessoas, organizações, eventos, times, lugares ou tópicos principais que deveriam ser usados para buscar notícias recentes. Responda apenas com uma lista separada por vírgula, sem explicação ou frases.

Pergunta: "${userQuery}"
    `;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 30,
      messages: [
        { role: 'system', content: "Você é um extrator de tópicos de notícias. Só responda os tópicos principais separados por vírgula, sem frases." },
        { role: 'user', content: prompt }
      ]
    });
    const topics = completion.choices?.[0]?.message?.content?.trim() || '';
    return topics.replace(/(^"|"$)/g, '').replace(/\.$/, '');
  } catch (err) {
    console.error('[extractNewsTopics] OpenAI error', err);
    return '';
  }
}

async function getDigest(userQuery = '') {
  try {
    let q = await extractNewsTopics(userQuery);
    if (!q || q.length < 2) q = userQuery || 'Brasil EUA imigração cultura';

    // **Sanitize the query for GNews**
    q = sanitizeQuery(q);

    // Always search in Portuguese/Brazil for your audience!
    const params = new URLSearchParams({
      q,
      lang: 'pt',
      country: 'br',
      max: 5,
      apikey: API_KEY
    });

    let url = `${BASE_URL}?${params.toString()}`;
    console.log('[GNewsAPI] Smart topics:', q);
    console.log('[GNewsAPI] URL:', url);

    let response = await fetch(url);

    // Retry fallback if 400 Bad Request
    if (response.status === 400 && q !== 'Brasil') {
      console.warn('[GNewsAPI] 400 error for query:', q, 'Retrying with "Brasil"');
      params.set('q', 'Brasil');
      response = await fetch(`${BASE_URL}?${params.toString()}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GNewsAPI] HTTP error', response.status, errorText);
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const data = await response.json();
    const articles = data.articles || [];

    if (!articles.length) {
      return '🧐 Nenhuma notícia relevante encontrada. Tente buscar só pelo nome da pessoa ou assunto principal (ex: "Trump", "Musk", "Palmeiras").';
    }

    const summary = articles
      .map(
        a => `📰 *${a.title}*\n${a.description || ''}\n🔗 ${a.url}`
      )
      .join('\n\n');
    return summary;
  } catch (err) {
    console.error('[GNewsAPI] fetch error', err);
    return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };