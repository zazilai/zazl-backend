// helpers/news.js

const perplexity = require('./perplexity');

async function getDigest(query = '') {
  const { answer } = await perplexity.search(query);
  return answer;
}

module.exports = { getDigest };