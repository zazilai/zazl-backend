// helpers/partners/amazonDica.js — Zazil 2025, GPT-4o keyword, fallback, debug

const axios = require('axios');
const crypto = require('crypto');
const replyHelper = require('../reply');
const { OpenAI } = require('openai');
const perplexityService = require('../perplexity');

const accessKey = process.env.AMAZON_PA_ACCESS_KEY;
const secretKey = process.env.AMAZON_PA_SECRET_KEY;
const partnerTag = process.env.AMAZON_PA_PARTNER_TAG;
const marketplace = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign('AWS4' + key, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

// STEP 1: Extract product keyword using GPT-4o
async function extractKeywords(query) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 12,
      messages: [
        {
          role: 'system',
          content: 'Extraia apenas o termo de busca ideal para encontrar um produto físico na Amazon nos EUA a partir da pergunta do usuário. Só o termo, sem explicação ou detalhes.'
        },
        { role: 'user', content: query }
      ]
    });
    return response.choices?.[0]?.message?.content?.trim() || query;
  } catch (err) {
    console.error('[AmazonDica extractKeywords] error:', err);
    return query;
  }
}

// STEP 2: Call Amazon PA API
async function searchAmazonProducts(keywords) {
  const region = 'us-east-1';
  const service = 'ProductAdvertisingAPI';
  const host = 'webservices.amazon.com';
  const endpoint = `https://${host}/paapi5/searchitems`;
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

  const payload = {
    Keywords: keywords,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace,
    ItemCount: 3,
    SearchIndex: 'All',
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Medium'
    ]
  };
  const payloadStr = JSON.stringify(payload);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = '/paapi5/searchitems';
  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=UTF-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const payloadHash = crypto.createHash('sha256').update(payloadStr, 'utf8').digest('hex');
  const canonicalRequest = [
    'POST', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm, amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  const authorizationHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  const headers = {
    'Content-Encoding': 'amz-1.0',
    'Content-Type': 'application/json; charset=UTF-8',
    'Host': host,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': target,
    'Authorization': authorizationHeader
  };

  try {
    const response = await axios.post(endpoint, payload, { headers });
    const items = response.data.SearchResult?.Items || [];
    if (!items.length) console.log('[amazonDica] Amazon returned 0 items for', keywords);
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      url: item.DetailPageURL,
      image: item.Images?.Primary?.Medium?.URL
    })).filter(i => i.title && i.url);
  } catch (err) {
    console.error('[amazonDica] Amazon PA API error:', err.response?.data || err.message || err);
    return [];
  }
}

// STEP 3: Main orchestrator — only for "shopping" messages!
module.exports = async function amazonDica(message, city, context, intent) {
  // Use a very safe/strict check for shopping (no generic "onde/quanto/etc.")
  const shoppingWords = /\b(comprar|produto|preço|quanto custa|amazon|loja|raquete|mochila|fone|laptop|iphone|camisa|tenis|sapato|tv|mala|relogio|câmera|bicicleta|tablet|headphone)\b/i;
  if (!(intent === 'AMAZON' || shoppingWords.test(message))) return [];

  if (!accessKey || !secretKey || !partnerTag) {
    console.error('[amazonDica] Amazon env not set');
    return [];
  }

  // Step 1: Extract shopping keyword using GPT-4o
  const keywords = await extractKeywords(message);

  // Step 2: Call Amazon PA API
  const items = await searchAmazonProducts(keywords);

  // If API failed or no results, fallback to Perplexity
  if (!items.length) {
    const { answer } = await perplexityService.search(message + " Amazon EUA");
    if (answer) {
      return [`🛒 Não achei produtos na Amazon, mas aqui vai uma dica extra:\n${answer}`];
    } else {
      return [];
    }
  }

  // Step 3: Return top (one) product
  return [replyHelper.amazon([items[0]]).content];
};