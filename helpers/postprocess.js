// helpers/postprocess.js

const AMAZON_AFFILIATE_TAG = 'zazilai-20';

// List of product "trigger" words (in Portuguese and English)
const PRODUCT_TRIGGERS = [
  'comprar', 'produto', 'loja', 'amazon', 'recomenda', 'onde encontro', 'onde posso', 'dica de', 'buy', 'shop', 'recommend', 'suggest'
];

/**
 * Makes every answer “feel like Zazil”: warm, short, and affiliate-friendly.
 * - For product/buying intent in generic answers, adds a “Dica do Zazil” with your Amazon affiliate search.
 * - Adds signature phrases, trims “robotic” endings, and formats as a friend.
 * @param {string} answer - The main AI answer.
 * @param {string} question - The incoming user question (raw).
 * @param {string} waNumber - For personalized links if needed.
 */
async function postprocess(answer, question, waNumber) {
  let out = (answer || '').trim();

  // Always keep it under 5-7 lines unless it’s an info dump
  if (out.split('\n').length > 7) {
    out = out.split('\n').slice(0, 6).join('\n') + '\n\n(Para mais detalhes, pergunte de novo!)';
  }

  // Always “sign” serious, bureaucratic, or immigration answers
  if (
    /passaporte|imigração|green card|visto|consulado|ssn|itn|ein|licença|taxa|formulár/i.test(question)
  ) {
    out += `\n\n_Dica do Zazil: Sempre confirme no site oficial ou fale com um especialista. Essas informações são gerais e não substituem aconselhamento profissional._`;
  }

  // Add “Dica do Zazil” with Amazon affiliate search if buying/product intent
  const normalized = question.toLowerCase();
  if (
    PRODUCT_TRIGGERS.some(trigger => normalized.includes(trigger)) &&
    !/mercado livre|magalu|walmart|best buy|target|aliexpress|shopify/i.test(normalized)
  ) {
    const searchTerm = encodeURIComponent(question.replace(/(onde|como|posso|comprar|uma|um|o|a|na|no|de|do|em|para|buy|shop|recommend|suggest)/gi, '').trim() || 'produto');
    const amazonUrl = `https://www.amazon.com/s?k=${searchTerm}&tag=${AMAZON_AFFILIATE_TAG}`;
    out += `\n\n🛒 *Dica do Zazil*: Veja opções confiáveis na Amazon:\n${amazonUrl}`;
  }

  // Add “Zazil” signature phrase at the end, but not twice
  if (!/Zazil/.test(out)) {
    out += `\n\n— Zazil, seu amigo nos EUA 🇺🇸🇧🇷`;
  }

  // Clean up double newlines and trailing whitespace
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

module.exports = postprocess;