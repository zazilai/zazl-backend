const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

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

async function fetchArticles(query) {
  const params = new URLSearchParams({
    q: query,
    lang: 'pt',
    country: 'br',
    max: 5,
    apikey: API_KEY
  });
  const url = `${BASE_URL}?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return data.articles || [];
}

async function getDigest(userQuery = '') {
  try {
    let extracted = await extractNewsTopics(userQuery);
    let q = (extracted && extracted.split(',')[0]?.trim()) || userQuery || 'Brasil';

    let articles = await fetchArticles(q);

    // Fallback if GNews fails or finds nothing
    if (!articles.length && q !== 'Brasil') {
      articles = await fetchArticles('Brasil');
    }

    if (!articles.length) {
      return '🧐 Nenhuma notícia relevante encontrada. Tente buscar só pelo nome da pessoa ou assunto principal (ex: "Trump", "Musk", "Palmeiras").';
    }

    // Construct a context for GPT
    // Only pass title/description/url to keep prompt short
    const articleSummaries = articles.map(
      (a, i) => `Notícia ${i + 1}:\nTítulo: ${a.title}\nResumo: ${a.description || ''}\nURL: ${a.url}\n`
    ).join('\n');

    const systemPrompt = `
Você é um assistente que responde perguntas usando apenas as notícias fornecidas abaixo. Responda de forma clara e objetiva em português brasileiro. 
Se a resposta exata não estiver nas notícias, diga que não foi possível encontrar uma resposta precisa, mas resuma o contexto relevante das notícias se houver.
Inclua links das notícias mais relevantes na resposta, se possível.
    `;

    const userPrompt = `
Pergunta: "${userQuery}"

Notícias Recentes:
${articleSummaries}
    `;

    // Compose and get the GPT answer
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    let reply = completion.choices?.[0]?.message?.content?.trim();
    // Defensive: fallback to generic if no reply
    if (!reply || typeof reply !== 'string') {
      reply = '🧐 Não foi possível encontrar uma resposta precisa nas notícias mais recentes.';
    }
    // Truncate to 1200 chars for WhatsApp/Twilio safety
    if (reply.length > 1200) {
      reply = reply.slice(0, 1150) + '\n\n✂️ Resposta resumida. Para mais detalhes, busque no Google Notícias!';
    }
    return reply;
  } catch (err) {
    console.error('[GNewsAPI] fetch or GPT error', err);
    return '📉 Nenhuma notícia recente encontrada no momento. Tente novamente em breve.';
  }
}

module.exports = { getDigest };