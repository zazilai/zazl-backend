// helpers/news.js

const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

/**
 * Uses GPT-4o to extract news topics/entities from the user's question.
 * Returns a comma-separated string of main topics for news search.
 */
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
    const topics = completion.choices?.[0]?.message?.content?.trim();
    // Always return a string (never undefined)
    return (topics && typeof topics === 'string') ? topics.replace(/(^"|"$)/g, '').replace(/\.$/, '') : '';
  } catch (err) {
    console.error('[extractNewsTopics] OpenAI error', err);
    return '';
  }
}

/**
 * Given a user query, extracts the best topic and searches for recent news (PT/BR).
 */
async function getDigest(userQuery = '') {
  try {
    let extracted = await extractNewsTopics(userQuery);
    // Defensive: fallback if extractNewsTopics fails
    if (!extracted || typeof extracted !== 'string') extracted = '';
    let q = extracted.split(',')[0]?.trim();
    if (!q || q.length < 2) q = userQuery || 'Brasil';

    const params = new URLSearchParams({
      q,
      lang: 'pt',
      country: 'br',
      max: 5,
      apikey: API_KEY
    });

    let url = `${BASE_URL}?${params.toString()}`;
    console.log('[GNewsAPI] Main topic:', q);
    console.log('[GNewsAPI] URL:', url);

    let response = await fetch(url);

    // Retry fallback if 400 Bad Request
    if (response.status === 400 && q !== 'Brasil') {
      console.warn('[GNewsAPI] 400 error for query:', q, 'Retrying with "Brasil"');
      params.set('q', 'Brasil');
      url = `${BASE_URL}?${params.toString()}`;
      response = await fetch(url);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GNewsAPI] HTTP error', response.status, errorText);
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const data = await response.json();
    const articles = data.articles || [];
    console.log('[GNewsAPI] Articles found:', articles.length);

    if (!articles.length) {
      return '🧐 Nenhuma notícia relevante encontrada. Tente buscar só pelo nome da pessoa ou assunto principal (ex: "Trump", "Musk", "Palmeiras").';
    }

    // Summarize articles (optional, see previous answer)
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