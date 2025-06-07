// helpers/news.js
const fetch = require('node-fetch');

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://bing-news-search1.p.rapidapi.com/news/search';
const HOST = 'bing-news-search1.p.rapidapi.com';

async function getDigest(topic = 'brasil') {
  try {
    const res = await fetch(`${BASE_URL}?q=${encodeURIComponent(topic)}&count=3&freshness=Day&textFormat=Raw&safeSearch=Off`, {
      method: 'GET',
      headers: {
        'X-BingApis-SDK': 'true',
        'X-RapidAPI-Key': NEWS_API_KEY,
        'X-RapidAPI-Host': HOST
      }
    });

    const data = await res.json();
    const articles = data.value || [];

    return articles.map(article => `• *${article.name}*\n${article.url}`).join('\n\n');
  } catch (err) {
    console.error('[news.js] Error fetching news:', err);
    return '⚠️ Não consegui buscar as notícias agora. Tente mais tarde!';
  }
}

module.exports = { getDigest };
