// helpers/isCurrentQuestion.js
module.exports = function isCurrentQuestion(msg) {
  if (!msg) return false;
  // Use ONLY for real-time topics: news, today’s events, scores, "agora", etc.
  return /\b(hoje|amanhã|agora|notícia|noticias|aconteceu|última hora|breaking|resultados?|placar|previsão|cotação|tempo|clima|trânsito|eventos?|agenda|jogo|shows?|concertos?|score|match(es)?|today|now|current|update|data)\b/i.test(msg);
};