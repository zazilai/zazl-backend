// helpers/news.js

const fetch = require('node-fetch');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';

async function getDigest(query = '') {
  try {
    const q = query.trim() || 'Brasil EUA imigração cultura';
    // GNews supports lang & country, customize as needed
    const params = new URLSearchParams({
      q,
      lang: 'pt',        // Use 'pt' for Portuguese, 'en' for English, etc.
      country: 'us',     // Use 'us' for United States news, 'br' for Brazil, etc.
      max: 5,
      apikey: API_KEY
    });

    // Debug logs for troubleshooting
    console.log('[GNewsAPI] Query:', q);
    console.log('[GNewsAPI] Using key:', API_KEY ? API_KEY.slice(0, 8) : 'undefined');

    const response = await fetch(`${BASE_URL}?${params.toString()}`);

    if (!response.ok) {
      console.error('[GNewsAPI] HTTP error', response.status, response.statusText);
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const data = await response.json();
    const articles = data.articles || [];

    if (!articles.length) {
      console.warn('[GNewsAPI] No articles found for query:', q);
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
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