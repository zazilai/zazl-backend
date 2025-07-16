// helpers/memory.js — Smart Memory System with City Context (Production Ready)

const { OpenAI } = require('openai');
const { admin } = require('./firebase');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = admin.firestore();

// Cosine similarity for vector comparison
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

// AI-powered memory extraction
async function extractMemorableInfo(userMessage, assistantResponse = '') {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: `Extract ONLY permanent user information from conversations.
Return JSON:
{
  "hasMemorableInfo": true/false,
  "memories": [
    {
      "type": "city|personal|preference|important",
      "content": "extracted info",
      "confidence": 0.0-1.0
    }
  ],
  "city": "city name if mentioned (null otherwise)",
  "summary": "one line summary if memorable, empty otherwise"
}`
        },
        {
          role: 'user',
          content: `User said: "${userMessage}"${assistantResponse ? `\nAssistant replied: "${assistantResponse.slice(0, 200)}"` : ''}`
        }
      ]
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('[Memory] Extraction error:', error);
    return { hasMemorableInfo: false, memories: [] };
  }
}

// Merge summaries intelligently
async function mergeSummaries(current, newInfo) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: 'Merge these summaries into ONE concise summary (max 150 chars). Keep only permanent info. No questions or temporary data.'
        },
        {
          role: 'user',
          content: `Current: ${current}\nNew: ${newInfo}`
        }
      ]
    });
    return response.choices[0].message.content.trim().slice(0, 200);
  } catch (error) {
    console.error('[Memory] Merge error:', error);
    return current;
  }
}

// Store memory as vector for semantic search
async function storeMemoryVector(waNumber, content, type) {
  try {
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content.slice(0, 1000)
    });
    const vector = embeddingRes.data[0].embedding;

    await db.collection('profiles').doc(waNumber).collection('memoryVectors').add({
      content,
      type,
      vector,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Cleanup old vectors (keep only 20)
    const vectors = await db.collection('profiles')
      .doc(waNumber)
      .collection('memoryVectors')
      .orderBy('timestamp', 'desc')
      .limit(21)
      .get();

    if (vectors.size > 20) {
      const oldestDoc = vectors.docs[vectors.docs.length - 1];
      await oldestDoc.ref.delete();
    }

    console.log(`[Memory] Stored vector: ${type} - ${content.slice(0, 50)}...`);
  } catch (error) {
    console.error('[Memory] Vector storage error:', error);
  }
}

// Main function to update user memory
async function updateUserSummary(waNumber, currentSummary, userMessage, assistantResponse = '') {
  try {
    const extraction = await extractMemorableInfo(userMessage, assistantResponse);
    if (!extraction.hasMemorableInfo) {
      console.log('[Memory] No memorable info found in message');
      return currentSummary || '';
    }

    if (extraction.city) {
      await db.collection('profiles').doc(waNumber).set({
        city: extraction.city
      }, { merge: true });
      console.log(`[Memory] Updated city to: ${extraction.city}`);
    }

    for (const memory of extraction.memories) {
      if (memory.confidence >= 0.7) {
        await storeMemoryVector(waNumber, memory.content, memory.type);
      }
    }

    if (extraction.summary) {
      const finalSummary = currentSummary
        ? await mergeSummaries(currentSummary, extraction.summary)
        : extraction.summary;

      await db.collection('profiles').doc(waNumber).set({
        memory: finalSummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return finalSummary;
    }

    return currentSummary || '';
  } catch (error) {
    console.error('[Memory] Update error:', error);
    return currentSummary || '';
  }
}

// Get relevant memory context for a query
async function getMemoryContext(waNumber, query) {
  try {
    if (!query || query.length < 3) return '';

    const profile = await db.collection('profiles').doc(waNumber).get();
    const profileData = profile.exists ? profile.data() : {};

    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.slice(0, 1000)
    });
    const queryVector = embeddingRes.data[0].embedding;

    const vectorsSnapshot = await db.collection('profiles')
      .doc(waNumber)
      .collection('memoryVectors')
      .get();

    if (vectorsSnapshot.empty) {
      return formatBasicContext(profileData);
    }

    const memories = [];
    vectorsSnapshot.forEach(doc => {
      const data = doc.data();
      const similarity = cosineSimilarity(queryVector, data.vector);
      if (similarity > 0.7) {
        memories.push({
          content: data.content,
          type: data.type,
          similarity: similarity
        });
      }
    });

    memories.sort((a, b) => b.similarity - a.similarity);
    const topMemories = memories.slice(0, 3);

    if (topMemories.length === 0) {
      return formatBasicContext(profileData);
    }

    return formatMemoryContext(topMemories, profileData);
  } catch (error) {
    console.error('[Memory] Context retrieval error:', error);
    return '';
  }
}

// Format basic context
function formatBasicContext(profileData) {
  const parts = [];
  if (profileData.city) {
    parts.push(`Cidade: ${profileData.city}`);
  }
  if (profileData.memory) {
    parts.push(`Info: ${profileData.memory}`);
  }
  return parts.join(' | ');
}

// Format memory context nicely
function formatMemoryContext(memories, profileData) {
  const contextParts = [];
  if (profileData.city) {
    contextParts.push(`Cidade: ${profileData.city}`);
  }
  const byType = {};
  memories.forEach(mem => {
    if (!byType[mem.type]) byType[mem.type] = [];
    byType[mem.type].push(mem.content);
  });
  if (byType.personal) {
    contextParts.push(`Pessoal: ${byType.personal.join(', ')}`);
  }
  if (byType.preference) {
    contextParts.push(`Preferências: ${byType.preference.join(', ')}`);
  }
  if (byType.important) {
    contextParts.push(`Importante: ${byType.important.join(', ')}`);
  }
  return contextParts.join(' | ');
}

// Get user's city
async function getUserCity(waNumber) {
  try {
    const profile = await db.collection('profiles').doc(waNumber).get();
    if (!profile.exists) return '';
    const data = profile.data();
    if (data.city) return data.city;

    if (data.memory) {
      const cityMatch = data.memory.match(/(?:moro em|vivo em|estou em|cidade:?\s*)([A-Za-zÀ-ÿ\s]+?)(?:[,.]|$)/i);
      if (cityMatch && cityMatch[1]) {
        const extractedCity = cityMatch[1].trim();
        await db.collection('profiles').doc(waNumber).set({ city: extractedCity }, { merge: true });
        return extractedCity;
      }
    }

    return '';
  } catch (error) {
    console.error('[Memory] City extraction error:', error);
    return '';
  }
}

// Check if a query needs city context
async function needsCityContext(query) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content: 'Reply only "yes" or "no". Would this query benefit from knowing the user\'s city?'
        },
        {
          role: 'user',
          content: query
        }
      ]
    });
    return response.choices[0].message.content.trim().toLowerCase() === 'yes';
  } catch (error) {
    console.error('[Memory] City context check error:', error);
    return false;
  }
}

module.exports = {
  updateUserSummary,
  getMemoryContext,
  getUserCity,
  needsCityContext,
  storeMemoryVector
};