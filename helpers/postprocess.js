// helpers/postprocess.js — Great Product, 2025-Compliant

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Clean various formatting issues
function cleanFormatting(text) {
  if (!text) return '';
  return text
    // Remove citation markers like [1]
    .replace(/\s*\[\d+\]/g, '')
    // Fix multiple line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Fix multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Remove trailing spaces
    .replace(/\s+$/gm, '')
    // Fix markdown bold for WhatsApp
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    // Fix bullet points
    .replace(/^[-•]\s+/gm, '• ')
    // Remove empty bullet points
    .replace(/^•\s*$/gm, '')
    .trim();
}

// Remove duplicate "Dica do Zazil" sections
function deduplicateDicas(text) {
  const lines = text.split('\n');
  const seen = new Set();
  const result = [];
  let inDicaSection = false;
  let currentDica = [];

  for (const line of lines) {
    if (line.includes('Dica do Zazil') || line.includes('💡')) {
      if (inDicaSection && currentDica.length > 0) {
        const dicaContent = currentDica.join('\n').trim();
        if (!seen.has(dicaContent)) {
          seen.add(dicaContent);
          result.push(dicaContent);
        }
      }
      inDicaSection = true;
      currentDica = [line];
    } else if (inDicaSection) {
      if (line.trim() === '' && currentDica.length > 1) {
        const dicaContent = currentDica.join('\n').trim();
        if (!seen.has(dicaContent)) {
          seen.add(dicaContent);
          result.push(dicaContent);
        }
        inDicaSection = false;
        currentDica = [];
        result.push('');
      } else {
        currentDica.push(line);
      }
    } else {
      result.push(line);
    }
  }

  if (inDicaSection && currentDica.length > 0) {
    const dicaContent = currentDica.join('\n').trim();
    if (!seen.has(dicaContent)) {
      result.push(dicaContent);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Ensure response has proper Zazil personality
async function ensureZazilVoice(content, query) {
  const hasEmoji = /[😊🎉💡🛒💚🇧🇷]/.test(content);
  const hasDica = /dica do zazil/i.test(content);
  const hasWarmth = /\b(querido|amigo|tá bom|né|viu)\b/i.test(content);

  if (hasEmoji && hasDica && hasWarmth) {
    return content;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: 'Add ONE short, warm Brazilian touch to this response if it lacks personality. Just return a phrase to append, nothing else.'
        },
        {
          role: 'user',
          content: `Query: ${query}\nResponse: ${content.slice(-200)}`
        }
      ]
    });

    const addition = response.choices[0].message.content.trim();

    if (addition && addition.length < 100 && !content.includes(addition)) {
      return content + '\n\n' + addition;
    }
    return content;
  } catch (error) {
    console.error('[Postprocess] Voice enhancement error:', error);
    return content;
  }
}

// Check for potential hallucinations or errors
async function checkQuality(content, query) {
  if (!content || content.length < 20) {
    return { hasIssues: true, reason: 'too_short' };
  }

  const lines = content.split('\n').filter(l => l.trim());
  const uniqueLines = new Set(lines);
  if (uniqueLines.size < lines.length * 0.7) {
    return { hasIssues: true, reason: 'repetitive' };
  }

  const errorPhrases = [
    'não tenho acesso',
    'não posso acessar',
    'como uma ia',
    'como um assistente',
    'i cannot',
    'i don\'t have access',
    'error:',
    'undefined',
    'null'
  ];

  const lowerContent = content.toLowerCase();
  for (const phrase of errorPhrases) {
    if (lowerContent.includes(phrase)) {
      return { hasIssues: true, reason: 'error_phrase' };
    }
  }

  return { hasIssues: false };
}

// Format the final response neatly
function formatFinalResponse(content) {
  const parts = content.split(/💡\s*(?:\*\*)?\s*Dica do Zazil/i);
  if (parts.length > 2) {
    const mainContent = parts[0].trim();
    const lastDica = parts[parts.length - 1].trim();
    return `${mainContent}\n\n💡 Dica do Zazil: ${lastDica}`;
  } else if (parts.length === 2) {
    const mainContent = parts[0].trim();
    const dica = parts[1].replace(/[:*]+/, '').trim();
    return `${mainContent}\n\n💡 Dica do Zazil: ${dica}`;
  }
  return content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/gm, '')
    .trim();
}

// Main postprocess function
module.exports = async function postprocess(replyObj, incoming) {
  let content = replyObj.content || '';
  console.log('[Postprocess] Original length:', content.length);

  // Step 1: Clean formatting
  content = cleanFormatting(content);

  // Step 2: Check quality
  const qualityCheck = await checkQuality(content, incoming);
  if (qualityCheck.hasIssues) {
    console.log('[Postprocess] Quality issue detected:', qualityCheck.reason);
    if (qualityCheck.reason === 'too_short') {
      content = 'Desculpe, não consegui gerar uma resposta completa. Pode reformular sua pergunta?';
    } else if (qualityCheck.reason === 'repetitive') {
      const lines = content.split('\n');
      const unique = [...new Set(lines)];
      content = unique.join('\n');
    } else if (qualityCheck.reason === 'error_phrase') {
      content = 'Opa, tive um probleminha ao processar sua pergunta. Vamos tentar de novo? Me conta com outras palavras o que você precisa!';
    }
  }

  // Step 3: Remove duplicate Dicas
  content = deduplicateDicas(content);

  // Step 4: Ensure Zazil voice
  content = await ensureZazilVoice(content, incoming);

  // Step 5: Format final response
  content = formatFinalResponse(content);

  // Step 6: Ensure we have a Dica do Zazil
  if (!content.includes('Dica do Zazil') && !content.includes('💡')) {
    const defaultDicas = [
      'Sempre que precisar, estou aqui para ajudar! 💚',
      'Pergunte sempre que tiver dúvidas sobre vida no exterior!',
      'A comunidade brasileira está sempre pronta para ajudar!',
      'Com paciência e jeitinho brasileiro, tudo se resolve! 😊',
      'Confira sempre as informações em fontes oficiais, tá bom?'
    ];
    const randomDica = defaultDicas[Math.floor(Math.random() * defaultDicas.length)];
    content += `\n\n💡 *Dica do Zazil:* ${randomDica}`;
  }

  if (content.length > 1500) {
    console.log('[Postprocess] Content too long, will be truncated by main flow');
  }

  console.log('[Postprocess] Final length:', content.length);
  replyObj.content = content;
  return replyObj;
};