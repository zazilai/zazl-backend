// helpers/news.js

const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function extractNewsTopics(userQuery) {
  // ...your existing code (unchanged)...
}

async function getDigest(userQuery = '') {
  try {
    let extracted = await extractNewsTopics(userQuery);
    let q = extracted.split(',')[0].trim();
    if (!q || q.length < 2) q = userQuery || 'Brasil';

    const params = new URLSearchParams({
      q,
      lang: 'pt',
      country: 'br',
      max: 5,
      apikey: API_KEY
    });

    let url = `${BASE_URL}?${params.toString()}`;
    let response = await fetch(url);

    // Retry fallback if 400 Bad Request
    if (response.status === 400 && q !== 'Brasil') {
      params.set('q', 'Brasil');
      url = `${BASE_URL}?${params.toString()}`;
      response = await fetch(url);
    }

    if (!response.ok) {
      return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
    }

    const data = await response.json();
    const articles = data.articles || [];

    if (!articles.length) {
      return '🧐 Nenhuma notícia relevante encontrada. Tente buscar só pelo nome da pessoa ou assunto principal (ex: "Trump", "Musk", "Palmeiras").';
    }

    // Aggregate titles and descriptions for GPT summarization
    const rawNews = articles.map(
      a => `Título: ${a.title}\n${a.description || ''}\nLink: ${a.url}`
    ).join('\n\n');

    // Summarize with GPT-4o (Portuguese, up to 5 points, no hallucination)
    const prompt = `
Resuma as notícias abaixo em até 5 tópicos curtos, em português, usando linguagem simples. Não adicione informações que não estejam nos textos. Se for relevante, inclua o link ao final de cada tópico.

${rawNews}
    `;
    let summary = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: 'system', content: "Você é um assistente brasileiro. Resuma as notícias para um leitor que quer entender rapidamente o que está acontecendo." },
          { role: 'user', content: prompt }
        ]
      });
      summary = completion.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('[GNewsAPI] GPT-4o summary error', err);
      // fallback: titles only
      summary = articles.map(a => `📰 *${a.title}*\n🔗 ${a.url}`).join('\n\n');
    }

    // Always stay under WhatsApp length
    const MAX_WA_MSG = 1600;
    if (summary.length > MAX_WA_MSG) {
      summary = summary.slice(0, MAX_WA_MSG - 200) + '\n\n✂️ *Resumo truncado.*';
    }

    return summary || '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  } catch (err) {
    console.error('[GNewsAPI] fetch error', err);
    return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };