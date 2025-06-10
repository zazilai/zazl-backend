// helpers/perplexity.js

const fetch = require('node-fetch');

const API_KEY = process.env.PPLX_API_KEY; // Set in Render as PPLX_API_KEY!
const BASE_URL = 'https://api.perplexity.ai/chat/completions';

// Helper to wrap fetch with timeout for resilience
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    )
  ]);
}

/**
 * Queries Perplexity API for a smart, current, summarized answer.
 * @param {string} query - The user's question.
 * @returns {Promise<{answer: string}>}
 */
async function search(query) {
  if (!API_KEY) {
    console.error('[Perplexity] API key missing!');
    return { answer: '🤖 Não foi possível buscar informações em tempo real (API key ausente).' };
  }

  const body = {
    model: 'sonar', // Use 'sonar-pro' for higher quality if you have access
    messages: [
      {
        role: 'system',
        content: `
Você é o Zazil, um assistente brasileiro que sempre responde de forma atualizada, confiável e direta. Use fontes recentes da web para criar respostas curtas, claras e, quando possível, inclua nomes e datas. 
Se não encontrar resposta, diga claramente: "Não consegui encontrar a resposta exata para isso."
Responda apenas à pergunta, sem explicações extras.
        `.trim()
      },
      {
        role: 'user',
        content: query
      }
    ]
  };

  try {
    const response = await fetchWithTimeout(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error('[Perplexity] HTTP error', response.status, await response.text());
      return { answer: '❌ Não consegui acessar informações atualizadas no momento.' };
    }

    const data = await response.json();
    const answer = (data?.choices?.[0]?.message?.content || '').trim();
    // Fallback for empty replies or "nonsense"
    if (!answer || answer.length < 8) {
      return { answer: 'Não consegui encontrar a resposta exata para isso.' };
    }
    return { answer };
  } catch (err) {
    console.error('[Perplexity] fetch error', err);
    return { answer: '❌ Não consegui buscar informações atualizadas devido a um erro técnico.' };
  }
}

module.exports = { search };