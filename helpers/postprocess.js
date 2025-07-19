// helpers/postprocess.js — Great Product Version with Embeddings & Metacognition (Complete)

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cosine similarity function (for embeddings)
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

// Clean formatting using smart patterns
function cleanFormatting(text) {
  if (!text) return '';
  
  return text
    .replace(/\s*\[\d+\]/g, '')                  // citations
    .replace(/\n{3,}/g, '\n\n')                  // excessive breaks
    .replace(/\s{2,}/g, ' ')                     // multiple spaces
    .replace(/\s+$/gm, '')                       // trailing spaces
    .replace(/\*\*(.*?)\*\*/g, '*$1*')           // markdown to WhatsApp
    .replace(/^[-•]\s+/gm, '• ')                 // normalize bullets
    .replace(/^•\s*$/gm, '')                     // empty bullets
    .trim();
}

// AI-powered duplicate detection
async function intelligentDedupe(text) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a text processor. Remove duplicate "Dica do Zazil" sections, keeping only the most relevant/contextual one (prioritize those tied to personalized references if present). 
Return the cleaned text maintaining all other content intact.`
        },
        {
          role: 'user',
          content: text
        }
      ]
    });
    
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('[Postprocess] Dedupe error:', error);
    return simpleDedupe(text);
  }
}

// Simple fallback dedupe
function simpleDedupe(text) {
  const sections = text.split(/💡\s*(?:Dica do Zazil)?:?\s*/i);
  if (sections.length <= 2) return text;
  
  const mainContent = sections[0].trim();
  const lastDica = sections[sections.length - 1].trim();
  
  return `${mainContent}\n\n💡 Dica do Zazil: ${lastDica}`;
}

// AI-powered quality assessment with Embeddings & Metacognition
async function assessContentQuality(content, query) {
  if (!content || content.length < 50) {
    return { 
      isValid: false, 
      reason: 'too_short',
      confidence: 1.0 
    };
  }

  try {
    // Get embeddings for semantic relevance
    const [queryEmb, contentEmb] = await Promise.all([
      openai.embeddings.create({ 
        model: 'text-embedding-3-small', 
        input: query.slice(0, 1000) 
      }),
      openai.embeddings.create({ 
        model: 'text-embedding-3-small', 
        input: content.slice(0, 1000) 
      })
    ]);
    
    const relevanceScore = cosineSimilarity(
      queryEmb.data[0].embedding, 
      contentEmb.data[0].embedding
    );

    console.log(`[Postprocess] Semantic relevance score: ${relevanceScore.toFixed(3)}`);

    if (relevanceScore < 0.6 && content.length < 200) {
      return { 
        isValid: false, 
        reason: 'irrelevant', 
        confidence: 1 - relevanceScore,
        suggestion: 'Content seems unrelated to the query'
      };
    }

    // Metacognitive AI check with thinking
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Self-assess: Is this response valid, complete, and relevant? 
First, reason briefly in <thinking> tags.
Then output JSON:
{
  "isValid": true/false,
  "reason": "valid|too_short|error_message|html_response|code_dump|irrelevant",
  "confidence": 0.0-1.0,
  "suggestion": "optional improvement"
}

Consider:
- Content length: ${content.length} chars
- Semantic relevance score: ${relevanceScore.toFixed(2)}
- Personalized references are valid if contextually tied
- Substantial content (>500 chars) is likely valid unless clearly broken`
        },
        { 
          role: 'user', 
          content: `Query: "${query}"\nResponse preview: "${content.slice(0, 500)}..."`
        }
      ]
    });
    
    const rawContent = response.choices[0].message.content;
    
    // Extract thinking
    const thinkingMatch = rawContent.match(/<thinking>(.*?)<\/thinking>/s);
    if (thinkingMatch) {
      console.log(`[Postprocess] Metacognition: ${thinkingMatch[1].trim()}`);
    }
    
    // Parse JSON (strip thinking)
    const jsonStr = rawContent.replace(/<thinking>.*?<\/thinking>/s, '').trim();
    const result = JSON.parse(jsonStr);
    
    // Adaptive override: embeddings trump AI if high relevance
    if (!result.isValid && relevanceScore > 0.8) {
      console.log(`[Postprocess] Override: High semantic relevance (${relevanceScore.toFixed(2)})`);
      result.isValid = true;
      result.reason = 'valid_embeddings_override';
    }
    
    return result;
  } catch (error) {
    console.error('[Postprocess] Quality assessment error:', error);
    return { isValid: true, reason: 'ai_check_failed', confidence: 0.5 };
  }
}

// AI-powered personality enhancement
async function enhanceWithPersonality(content, query) {
  if (/[🇧🇷💡😊🎉💚]/.test(content) && /Dica do Zazil/i.test(content)) {
    return content;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `You are Zazil's personality enhancer. If the response lacks warmth, add ONE authentic Brazilian touch—especially amplifying any personalized references subtly like a friend would.
Keep it natural and contextual. Return only the phrase to add, or "none" if already good.`
        },
        {
          role: 'user',
          content: `Query: ${query}\nCurrent response ending: ...${content.slice(-200)}`
        }
      ]
    });
    
    const addition = response.choices[0].message.content.trim();
    
    if (addition && addition !== 'none' && addition.length < 150) {
      return content + '\n\n' + addition;
    }
  } catch (error) {
    console.error('[Postprocess] Personality enhancement error:', error);
  }
  
  return content;
}

// Intelligent final formatting
async function formatIntelligently(content) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `Format this WhatsApp message ensuring:
1. Only ONE "Dica do Zazil" section at the end
2. Proper WhatsApp formatting (no markdown except *)
3. Clean paragraph breaks
4. Maintain all original information

Return the formatted message.`
        },
        {
          role: 'user',
          content: content
        }
      ]
    });
    
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('[Postprocess] Formatting error:', error);
    return simpleDedupe(content);
  }
}

// Main postprocessing with AI intelligence
module.exports = async function postprocess(replyObj, incoming) {
  let content = replyObj.content || '';
  
  console.log('[Postprocess] Starting intelligent processing...');
  console.log('[Postprocess] Original length:', content.length);
  
  // Step 1: Basic cleaning
  content = cleanFormatting(content);
  
  // Step 2: AI-powered quality assessment with embeddings
  const quality = await assessContentQuality(content, incoming);
  console.log('[Postprocess] Quality assessment:', quality);
  
  if (!quality.isValid && quality.confidence > 0.8) {
    switch (quality.reason) {
      case 'too_short':
        content = 'Opa, não consegui elaborar uma resposta completa. Pode me dar mais detalhes sobre o que precisa? 😊';
        break;
      case 'error_message':
      case 'html_response':
        content = 'Xiii, tive um probleminha técnico aqui! 😅 Vamos tentar de novo? Me pergunta de outro jeito!';
        break;
      case 'irrelevant':
        content = 'Hmm, acho que não entendi bem sua pergunta. Pode explicar de outra forma? Estou aqui pra ajudar! 💚';
        break;
      default:
        console.log('[Postprocess] Keeping original despite issue:', quality.reason);
    }
  }
  
  // Step 3: Intelligent deduplication
  if (content.split('Dica do Zazil').length > 2) {
    content = await intelligentDedupe(content);
  }
  
  // Step 4: Enhance personality
  content = await enhanceWithPersonality(content, incoming);
  
  // Step 5: Smart formatting
  content = await formatIntelligently(content);
  
  // Step 6: Ensure Dica exists
  if (!content.includes('Dica do Zazil')) {
    try {
      const dicaResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 50,
        messages: [
          {
            role: 'system',
            content: 'Generate ONE short, encouraging "Dica do Zazil" in Portuguese for a Brazilian expat. Make it warm and contextual.'
          },
          {
            role: 'user',
            content: `Query was: ${incoming}`
          }
        ]
      });
      
      const dica = dicaResponse.choices[0].message.content.trim();
      content += `\n\n💡 Dica do Zazil: ${dica}`;
    } catch {
      const fallbacks = [
        'Conte sempre comigo para suas dúvidas! 💚',
        'A comunidade brasileira está aqui pra apoiar! 🇧🇷',
        'Passo a passo, tudo se resolve! 😊'
      ];
      content += `\n\n💡 Dica do Zazil: ${fallbacks[Math.floor(Math.random() * fallbacks.length)]}`;
    }
  }
  
  console.log('[Postprocess] Final length:', content.length);
  
  replyObj.content = content;
  return replyObj;
};