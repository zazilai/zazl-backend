// helpers/postprocess.js

/**
 * "Zazil-izes" only generic/news answers for personality and trust,
 * but NEVER changes FX, events, amazon, or cancel replies.
 * Now also removes all [N] reference markers everywhere for cleanliness.
 *
 * If intent is AMAZON: Remove all mentions of Brazilian stores from answer!
 */

function cleanCitations(text) {
  if (!text) return '';
  // Removes all instances of [number] everywhere in the text (e.g. [1], [2], [15])
  return text.replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
}

// Helper to strip Brazilian store mentions from any answer
function sanitizeBrazilianStores(text) {
  if (!text) return '';
  const forbidden = [
    'mercado livre', 'magalu', 'americanas', 'submarino', 'decathlon brasil', 'netshoes', 'casas bahia',
    '.br', 'magazineluiza', 'shoptime', 'pontofrio', 'extra.com', 'carrefour brasil', 'rihappy'
  ];
  let result = text;
  forbidden.forEach(word => {
    const regex = new RegExp(`.*${word}.*\\n?`, 'gi');
    result = result.replace(regex, '');
  });
  if (!result.trim()) {
    return 'Recomendo procurar em Amazon.com, Walmart US, Target US, Best Buy, ou lojas físicas nos EUA!';
  }
  return result.trim();
}

module.exports = function postprocess(replyObj, question = '', intent = '') {
  if (!replyObj || typeof replyObj !== 'object' || typeof replyObj.content !== 'string') {
    return replyObj;
  }
  replyObj.content = cleanCitations(replyObj.content);

  // Only "Zazil-ize" generic/news/factual AI answers
  if (['GENERIC', 'NEWS'].includes(intent)) {
    replyObj.content = replyObj.content.replace(/\n*Sources?:.*$/ims, '').trim();
    if (!replyObj.content.match(/Dica do Zazil:/i)) {
      replyObj.content += '\n\n💡 Dica do Zazil: Sempre confira informações importantes em fontes oficiais ou com um profissional de confiança!';
    }
  }

  // For AMAZON answers: forcibly remove BR stores, add US-store tip if needed
  if (intent === 'AMAZON') {
    replyObj.content = sanitizeBrazilianStores(replyObj.content);
    // Optionally, reinforce the US-only tip
    if (!replyObj.content.match(/Amazon\.com|Walmart US|Target US|Best Buy/i)) {
      replyObj.content += '\n\n💡 Dica do Zazil: Sempre prefira comprar em lojas dos EUA, como Amazon.com, Walmart US, Target US, ou Best Buy!';
    }
  }

  // Other intents: no change beyond citations
  return replyObj;
};