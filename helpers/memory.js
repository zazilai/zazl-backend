// helpers/memory.js — Advanced RAG with Relevance Check & Conversation Summaries (July 2025)

const { OpenAI } = require('openai');
const { admin } = require('./firebase');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = admin.firestore();

// Cosine similarity
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

const systemPrompt = `
Mantenha APENAS dados PESSOAIS e PERMANENTES (nome, cidade, profissão, interesses fixos, datas especiais). NÃO registre perguntas, buscas ou respostas. Resuma conversas em 1 frase curta, natural, apenas com info nova permanente.
`;

// Detect intent
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

// Update: Append summaries, no questions
async function updateUserSummary(waNumber, oldSummary, userMessage) {
  try {
    const intent = await detectIntent(userMessage);
    if (intent === 'feedback') {
      await db.collection('feedback').add({
        waNumber,
        query: userMessage,
        rating: userMessage.toLowerCase().includes('sim') ? 'positive' : 'negative',
        timestamp: new Date()
      });
      return oldSummary || '';
    }

    if (intent === 'follow-up' || !/\b(eu|meu|minha|sou|moro|profissão|interesse|cidade)\b/i.test(userMessage)) {
      return oldSummary || '';
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 80,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resumo atual: ${oldSummary || 'Nenhum'}. Nova mensagem: ${userMessage}. Resumo atualizado:` }
      ]
    });

    let newSummary = response.choices[0].message.content.trim() || oldSummary;
    if (newSummary.length > 200) newSummary = oldSummary;

    if (newSummary !== oldSummary) {
      // Embed and store
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
      // Prune to 10
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

// Get context: Higher threshold, relevance check
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
    }).filter(s => s.sim > 0.85) // Higher threshold for relevance
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 2);

    if (similarities.length === 0) return ''; // No relevant memory

    return similarities.map(s => s.summary).join(' | ');
  } catch (err) {
    console.error('[MEMORY] Retrieval error:', err);
    return '';
  }
}

module.exports = { updateUserSummary, getMemoryContext };