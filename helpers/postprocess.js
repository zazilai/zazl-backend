// helpers/postprocess.js — Great Product Version with AI-Powered Intelligence (Updated for Memory Synergy)

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Clean formatting using smart patterns
function cleanFormatting(text) {
  if (!text) return '';
  
  // Use AI to detect and clean formatting issues
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
    // Fallback to simple dedupe
    return simpleDedupe(text);
  }
}

// Simple fallback dedupe
function simpleDedupe(text) {
  const sections = text.split(/💡\s*(?:Dica do Zazil)?:?\s*/i);
  if (sections.length <= 2) return text;
  
  // Keep main content and last dica
  const mainContent = sections[0].trim();
  const lastDica = sections[sections.length - 1].trim();
  
  return `${mainContent}\n\n💡 Dica do Zazil: ${lastDica}`;
}

// AI-powered quality assessment
async function assessContentQuality(content, query) {
  if (!content || content.length < 20) {
    return { 
      isValid: false, 
      reason: 'too_short',
      confidence: 1.0 
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: `Analyze if this is a valid WhatsApp response or a technical error. Consider personalized references (e.g., nods to past queries) as valid if they tie back to the query.

Return JSON:
{
  "isValid": true/false,
  "reason": "valid|too_short|error_message|html_response|code_dump|irrelevant",
  "confidence": 0.0-1.0,
  "suggestion": "optional improvement suggestion"
}`
        },
        {
          role: 'user',
          content: `Query: "${query}"\n\nResponse to analyze: "${content.slice(0, 500)}"`
        }
      ]
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('[Postprocess] Quality assessment error:', error);
    // If AI fails, assume content is valid
    return { isValid: true, reason: 'ai_check_failed', confidence: 0.5 };
  }
}

// AI-powered personality enhancement
async function enhanceWithPersonality(content, query) {
  // Quick check if already has personality
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
  
  // Step 2: AI-powered quality assessment
  const quality = await assessContentQuality(content, incoming);
  console.log('[Postprocess] Quality assessment:', quality);
  
  if (!quality.isValid && quality.confidence > 0.8) {
    // Only replace for high-confidence issues
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
        // Keep original but log issue
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
  
  // Step 6: Ensure Dica exists (if not added by AI)
  if (!content.includes('Dica do Zazil')) {
    // Use AI to generate contextual dica
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
      // Fallback dicas
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