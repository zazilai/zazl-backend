// helpers/news.js
const axios = require('axios');

const API_KEY = process.env.BING_NEWS_API_KEY;
const API_HOST = 'bing-news-search1.p.rapidapi.com';
const API_URL = 'https://bing-news-search1.p.rapidapi.com/news/search';

async function getDigest(query = '') {
  try {
    const response = await axios.get(API_URL, {
      params: {
        q: query || 'Brazil USA immigration',
        count: 5,
        freshness: 'Day',
        textFormat: 'Raw',
        safeSearch: 'Moderate'
      },
      headers: {
        'X-BingApis-SDK': 'true',
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': API_HOST
      }
    });

    const articles = response.data.value;
    if (!articles || !articles.length) return '📰 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';

    const digest = articles.map(article => {
      const title = article.name || 'Notícia';
      const source = article.provider?.[0]?.name || '';
      const url = article.url || '';
      return `🗞️ *${title}* (${source})\n🔗 ${url}`;
    }).join('\n\n');

    return digest;
  } catch (err) {
    console.error('[news.js] erro ao buscar notícias:', err.message);
    return '📰 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };