const fetch = require('node-fetch');

const API_KEY = process.env.RAPIDAPI_KEY;
const HOST = 'bing-news-search1.p.rapidapi.com';
const BASE_URL = `https://${HOST}/news/search`;

async function getDigest(query = '') {
  try {
    const q = query.trim() || 'Brasil EUA imigração cultura';
    const response = await fetch(`${BASE_URL}?q=${encodeURIComponent(q)}&count=5&freshness=Day&textFormat=Raw&safeSearch=Off`, {
      method: 'GET',
      headers: {
        'X-BingApis-SDK': 'true',
        'X-RapidAPI-Host': HOST,
        'X-RapidAPI-Key': API_KEY
      }
    });

    if (!response.ok) {
      console.error('[NewsAPI] HTTP error', response.status);
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const data = await response.json();
    const articles = data.value || [];

    if (!articles.length) {
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const summary = articles.map(a => `📰 *${a.name}*
${a.description}
🔗 ${a.url}`).join('\n\n');
    return summary;
  } catch (err) {
    console.error('[NewsAPI] fetch error', err);
    return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };