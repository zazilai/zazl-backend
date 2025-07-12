// helpers/memory.js — Enhanced with RAG, Feedback, Follow-Up Detection (July 2025)

const { OpenAI } = require('openai');
const { admin } = require('./firebase');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = admin.firestore();

// Cosine similarity function (simple math, no deps)
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// System prompt for personal data filtering
const systemPrompt = `
Você é um assistente de IA que mantém APENAS dados PESSOAIS e PERMANENTES do usuário (nome, cidade, profissão, interesses fixos, datas especiais). NÃO registre buscas, compras, perguntas ou interesses momentâneos (ex: eventos, produtos, notícias).
Filtre rigorosamente: Se a mensagem NÃO contiver info pessoal nova, retorne o resumo anterior inalterado.
Atualize apenas se houver novo dado pessoal claro. Mantenha o resumo em 1-2 frases curtas, natural.
Exemplo:
Resumo atual: Pedro mora em Austin.
Nova mensagem: Sou engenheiro, aniversário em 10/10.
Resumo atualizado: Pedro mora em Austin. Profissão: engenheiro. Aniversário: 10/10.

Se nada novo ou mensagem curta como "sim" ou "nao", retorne exatamente o resumo atual.
`;

// Detect feedback or follow-up intent
async function detectIntent(message) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: 'system',
          content: 'Classifique a mensagem como: "feedback" (ex: sim/nao), "follow-up" (resposta curta a pergunta anterior), ou "none". Retorne apenas: type:feedback|follow-up|none.'
        },
        { role: 'user', content: message }
      ]
    });
    const content = response.choices?.[0]?.message?.content?.trim() || 'type:none';
    return content.split(':')[1] || 'none';
  } catch (err) {
    console.error('[MEMORY] Intent detection error:', err);
    return 'none';
  }
}

// Update user summary with strict personal data filter
async function updateUserSummary(waNumber, oldSummary, userMessage) {
  try {
    // Detect intent first
    const intent = await detectIntent(userMessage);
    if (intent === 'feedback') {
      // Log feedback to Firestore
      await db.collection('feedback').add({
        waNumber,
        query: userMessage,
        rating: userMessage.toLowerCase().includes('sim') ? 'positive' : 'negative',
        timestamp: new Date()
      });
      return oldSummary || '';
    }

    // Skip if follow-up or non-personal (AI-driven filter)
    if (intent === 'follow-up' || !/\b(eu|meu|minha|sou|moro|morar|aniversário|profissão|trabalho|interesse|data|nome|cidade|país)\b/i.test(userMessage)) {
      return oldSummary || '';
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 80,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resumo atual:\n${oldSummary || 'Nenhum resumo ainda.'}\n\nNova mensagem:\n${userMessage}\n\nResumo atualizado:` }
      ]
    });

    let newSummary = response.choices?.[0]?.message?.content?.trim() || oldSummary;
    if (newSummary === 'Nenhum resumo ainda.' || newSummary.length > 200) {
      newSummary = oldSummary; // Prevent bloat
    }

    // RAG: Embed and store if changed
    if (newSummary && newSummary !== oldSummary) {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: newSummary
      });
      const vector = embeddingRes.data[0].embedding;
      await db.collection('profiles').doc(waNumber).collection('memoryVectors').add({
        summary: newSummary,
        vector,
        timestamp: new Date()
      });
      // Prune: Keep last 10 vectors
      const oldVectors = await db.collection('profiles').doc(waNumber).collection('memoryVectors').orderBy('timestamp', 'desc').limit(11).get();
      if (oldVectors.size > 10) {
        oldVectors.docs.slice(10).forEach(doc => doc.ref.delete());
      }
    }

    return newSummary;
  } catch (err) {
    console.error('[MEMORY] Update error:', err);
    return oldSummary || '';
  }
}

// Retrieve relevant memory context using RAG (top 2 similar)
async function getMemoryContext(waNumber, query) {
  try {
    if (!query) return '';
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });
    const queryVec = queryEmbedding.data[0].embedding;

    const vectorsSnap = await db.collection('profiles').doc(waNumber).collection('memoryVectors').get();
    if (vectorsSnap.empty) return '';

    let similarities = vectorsSnap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, summary: data.summary, sim: cosineSimilarity(queryVec, data.vector) };
    }).filter(s => s.sim > 0.7) // Threshold for relevance
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 2); // Top 2

    return similarities.map(s => s.summary).join(' | ');
  } catch (err) {
    console.error('[MEMORY] Retrieval error:', err);
    return '';
  }
}

module.exports = { updateUserSummary, getMemoryContext };