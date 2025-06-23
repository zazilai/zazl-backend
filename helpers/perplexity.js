// helpers/perplexity.js

const fetch = require('node-fetch');
const API_KEY = process.env.PPLX_API_KEY;
const BASE_URL = 'https://api.perplexity.ai/chat/completions';

/**
 * Always adds user location (city or 'EUA') and retail context for US queries.
 */
function buildPerplexityPrompt(query, city) {
  let contextGuide = '';
  if (/passaporte|consulado|embaixada|documento|renovar/i.test(query)) {
    contextGuide = `
Atenção: O usuário está nos EUA${city ? `, na cidade de ${city}` : ''}. Sempre responda de acordo com os procedimentos, instituições e serviços disponíveis para brasileiros NOS ESTADOS UNIDOS${city ? `, especialmente em ${city}` : ''}. Sempre forneça links oficiais se possível.
    `.trim();
  } else if (/comprar|produto|loja|preço|amazon|walmart|target|best buy|custa|encontro/i.test(query)) {
    contextGuide = `
O usuário está nos EUA${city ? `, na cidade de ${city}` : ''}. Sempre sugira lojas e serviços disponíveis nos EUA, como Amazon, Best Buy, Walmart, Target, Costco, Sam’s Club ou mercados brasileiros locais, NUNCA lojas do Brasil como Mercado Livre, Magalu, Americanas, Rappi etc.
    `.trim();
  } else if (/evento|show|festa|balada|programa|agenda|o que fazer|acontece|tem pra fazer/i.test(query)) {
    contextGuide = `
O usuário está nos EUA${city ? `, na cidade de ${city}` : ''}. Responda apenas com eventos e atividades relevantes para brasileiros nessa cidade ou região.
    `.trim();
  } else {
    contextGuide = `
Considere que o usuário está nos EUA${city ? `, na cidade de ${city}` : ''}. Todas as recomendações, orientações e informações devem ser relevantes para brasileiros no exterior, especialmente nos EUA.
    `.trim();
  }
  return `${query}\n\n${contextGuide}`;
}

// Helper to wrap fetch with timeout for resilience
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    )
  ]);
}

async function search(query, city = '') {
  if (!API_KEY) {
    console.error('[Perplexity] API key missing!');
    return { answer: '🤖 Não foi possível buscar informações em tempo real (API key ausente).' };
  }

  const userPrompt = buildPerplexityPrompt(query, city);

  const body = {
    model: 'sonar', // Use 'sonar-pro' for higher quality if you have access
    messages: [
      {
        role: 'system',
        content: `
Você é o Zazil, um assistente brasileiro que sempre responde de forma atualizada, confiável e direta. Use fontes recentes da web para criar respostas curtas, claras e, quando possível, inclua nomes e datas. Se não encontrar resposta, diga claramente: "Não consegui encontrar a resposta exata para isso." Responda apenas à pergunta, sem explicações extras.
        `.trim()
      },
      {
        role: 'user',
        content: userPrompt
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