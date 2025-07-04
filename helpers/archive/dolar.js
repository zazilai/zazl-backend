const axios = require('axios');

let cachedRate = null;
let lastFetch = 0;

async function getRate() {
  const now = Date.now();

  // Cache for 15 minutes
  if (cachedRate && (now - lastFetch < 15 * 60 * 1000)) {
    return cachedRate;
  }

  try {
    const response = await axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = response.data.USDBRL;

    cachedRate = {
      buy: parseFloat(data.bid),
      sell: parseFloat(data.ask)
    };

    lastFetch = now;
    return cachedRate;
  } catch (error) {
    console.error('[FX ERROR]', error.message);
    return {
      buy: 5.0,
      sell: 5.2,
      error: true
    };
  }
}

module.exports = { getRate };
