// helpers/amazon.js
const axios = require('axios');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const perplexityService = require('./perplexity');

const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(key, date, region, service) {
  const kDate = sign('AWS4' + key, date);
  const kRegion = sign(kDate, region);
  const kService = sign(kRegion, service);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

async function extractKeywords(query) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0.2,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content: 'Extraia o termo de busca mais eficiente para encontrar um produto físico na Amazon a partir da pergunta do usuário. Apenas o termo, sem explicação.'
        },
        { role: 'user', content: query }
      ]
    });
    return response.choices?.[0]?.message?.content?.trim() || query;
  } catch (err) {
    console.error('[Amazon extractKeywords] error:', err);
    return query;
  }
}

async function searchAmazonProducts(query) {
  const keywords = await extractKeywords(query);

  const payload = {
    Keywords: keywords,
    PartnerTag: PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.com',
    Operation: 'SearchItems', // <-- Required!
    ItemCount: 3,
    SearchIndex: 'All',
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Large',
      'DetailPageURL'
    ]
  };
  const payloadJson = JSON.stringify(payload);

  // AWS date/time
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Canonical request (includes all headers used in actual HTTP request!)
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-encoding': 'amz-1.0',
    host: HOST,
    'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    'x-amz-date': amzDate,
    'x-amz-content-sha256': crypto.createHash('sha256').update(payloadJson).digest('hex'),
  };
  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join('\n') + '\n';
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalRequest = [
    'POST',
    '/paapi5/searchitems',
    '',
    canonicalHeaders,
    signedHeaders,
    headers['x-amz-content-sha256']
  ].join('\n');
  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, 'ProductAdvertisingAPI');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = [
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  try {
    const response = await axios.post(ENDPOINT, payloadJson, {
      headers: {
        ...headers,
        Authorization: authorizationHeader
      }
    });

    const items = response.data?.SearchResult?.Items || [];
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    }));
  } catch (err) {
    // Log and fallback to Perplexity
    console.error('[Amazon API Great Product fetch failed]:', err.response?.data || err.message);
    const { answer } = await perplexityService.search(query);
    return [
      {
        title: 'Resultado alternativo',
        price: '',
        image: '',
        url: '',
        answer: answer || 'Não encontrei produtos relevantes na Amazon agora. Tente buscar de outra forma ou com palavras mais específicas!'
      }
    ];
  }
}

module.exports = { searchAmazonProducts };