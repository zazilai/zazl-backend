// helpers/postprocess.js — Cleaned for 2025

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Clean up text formatting
function cleanFormatting(text) {
  if (!text) return '';
  return text
    .replace(/\s*\[\d+\]/g, '')                  // remove citation markers
    .replace(/\n{3,}/g, '\n\n')                  // reduce excessive line breaks
    .replace(/\s{2,}/g, ' ')                     // fix multiple spaces
    .replace(/\s+$/gm, '')                       // remove trailing spaces
    .replace(/\*\*(.*?)\*\*/g, '*$1*')           // fix bold for WhatsApp
    .replace(/^[-•]\s+/gm, '• ')                 // normalize bullets
    .replace(/^•\s*$/gm, '')                     // remove empty bullets
    .trim();
}

// Deduplicate Dica do Zazil sections
function deduplicateDicas(text) {
  const lines = text.split('\n');
  const seen = new Set();
  const result = [];
  let currentDica = [];

  for (const line of lines) {
    if (/💡|Dica do Zazil/i.test(line)) {
      if (currentDica.length > 0) {
        const dicaBlock = currentDica.join('\n').trim();
        if (!seen.has(dicaBlock)) {
          seen.add(dicaBlock);
          result.push(dicaBlock);
        }
        currentDica = [];
      }
      currentDica.push(line);
    } else if (currentDica.length > 0) {
      currentDica.push(line);
    } else {
      result.push(line);
    }
  }

  if (currentDica.length > 0) {
    const dicaBlock = currentDica.join('\n').trim();
    if (!seen.has(dicaBlock)) {
      result.push(dicaBlock);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

// GPT-powered voice enhancement (adds one warm Brazilian touch if needed)
async function ensureZazilVoice(content, query) {
  const hasPersonality = /[🇧🇷💡😊🎉]|(Dica do Zazil)/i.test(content);
  if (hasPersonality) return content;

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

    const addition = response.choices?.[0]?.message?.content?.trim();
    if (addition && addition.length < 100 && !content.includes(addition)) {
      return content + '\n\n' + addition;
    }
  } catch (err) {
    console.error('[Zazil Voice] Error:', err);
  }

  return content;
}

// Flag common issues for retry or fallback
async function checkQuality(content) {
  const lower = content.toLowerCase();

  const issues = [
    !content || content.length < 20,
    /não (tenho|posso) acesso|como uma ia|error|undefined|null/i.test(lower),
    content.split('\n').filter(l => l.trim()).length < 3
  ];

  if (issues.some(Boolean)) {
    return { hasIssues: true };
  }

  return { hasIssues: false };
}

// Final formatting cleanup
function formatFinalResponse(content) {
  const [main, ...dicas] = content.split(/💡\s*(?:\*\*)?\s*Dica do Zazil[:\*]*/i);
  if (dicas.length > 0) {
    return main.trim() + '\n\n💡 Dica do Zazil: ' + dicas.pop().trim();
  }
  return content.trim();
}

// Main postprocessing flow
module.exports = async function postprocess(replyObj, incoming) {
  let content = replyObj.content || '';
  content = cleanFormatting(content);

  const quality = await checkQuality(content);
  if (quality.hasIssues) {
    content = 'Desculpe, não consegui gerar uma resposta completa. Tente reformular a pergunta ou aguarde um momento.';
  }

  content = deduplicateDicas(content);
  content = await ensureZazilVoice(content, incoming);
  content = formatFinalResponse(content);

  if (!content.includes('Dica do Zazil')) {
    const extras = [
      'Pergunte sempre que tiver dúvidas sobre vida no exterior!',
      'Com paciência e jeitinho brasileiro, tudo se resolve! 🇧🇷',
      'Estou aqui pra te ajudar sempre que precisar! 💚'
    ];
    const extra = extras[Math.floor(Math.random() * extras.length)];
    content += `\n\n💡 Dica do Zazil: ${extra}`;
  }

  replyObj.content = content;
  return replyObj;
};