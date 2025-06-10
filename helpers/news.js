// helpers/news.js

const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    return (topics && typeof topics === 'string') ? topics.replace(/(^"|"$)/g, '').replace(/\.$/, '') : '';
  } catch (err) {
    console.error('[extractNewsTopics] OpenAI error', err);
    return '';
  }
}

// -- New: summarizeNews --
async function summarizeNews(userQuery, articles = []) {
  try {
    if (!Array.isArray(articles) || !articles.length) {
      return '';
    }
    // Limit to 5 for OpenAI prompt size
    const newsList = articles.slice(0, 5).map(a =>
      `Título: ${a.title}\nDescrição: ${a.description || ''}\nLink: ${a.url}`
    ).join('\n\n');

    const prompt = `
Resuma as notícias abaixo em português claro, respondendo diretamente à pergunta do usuário ("${userQuery}"). Foque no que há de mais atual e relevante. Use linguagem informal, como se fosse um amigo contando as novidades, e inclua os principais links.

Notícias:
${newsList}

Resumo:
    `;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        { role: 'system', content: 'Você é um assistente brasileiro. Resuma as notícias para o usuário de forma clara, atualizada e útil.' },
        { role: 'user', content: prompt }
      ]
    });
    return completion.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[summarizeNews] OpenAI error', err);
    return '';
  }
}

// -- Main export --
async function getDigest(userQuery = '') {
  try {
    let extracted = await extractNewsTopics(userQuery);
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

    // -- Resilient fallback --
    if (!articles.length) {
      return '🧐 Nenhuma notícia relevante encontrada. Tente buscar só pelo nome da pessoa ou assunto principal (ex: "Trump", "Musk", "Palmeiras").';
    }

    // -- New: Use OpenAI to summarize, fallback if fails --
    const summary = await summarizeNews(userQuery, articles);
    if (!summary || summary.length < 10) {
      // fallback: show basic headlines/links
      return articles.slice(0, 3).map(a =>
        `📰 *${a.title}*\n${a.description || ''}\n🔗 ${a.url}`
      ).join('\n\n');
    }
    return summary;
  } catch (err) {
    console.error('[GNewsAPI] fetch error', err);
    return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };