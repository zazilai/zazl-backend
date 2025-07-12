// helpers/partners/amazonDica.js — Model-Driven Intent, No Hard-Coded Words (July 2025)

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

// STEP 1: Model-driven intent detection + keyword extraction
async function detectAndExtractKeywords(message, city) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'Primeiro, classifique se a mensagem é sobre comprar um produto (shopping intent): "sim" ou "não". Se sim, extraia o termo de busca ideal para Amazon nos EUA, incluindo cidade se relevante. Retorne apenas: intent:sim|não; keywords:termo.'
        },
        { role: 'user', content: message + (city ? ` (usuário em ${city})` : '') }
      ]
    });
    const content = response.choices?.[0]?.message?.content?.trim() || '';
    const intentMatch = content.match(/intent:(sim|n.o)/i);
    const keywordsMatch = content.match(/keywords:(.+)/i);
    if (intentMatch?.[1].toLowerCase() === 'sim' && keywordsMatch?.[1]) {
      return keywordsMatch[1].trim();
    }
    return null;
  } catch (err) {
    console.error('[AmazonDica detect] error:', err);
    return null;
  }
}

// STEP 2: Call Amazon PA API (unchanged)
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

// Main: Model-driven, no hard-coded words
module.exports = async function amazonDica(message, city, context, intent) {
  const keywords = await detectAndExtractKeywords(message, city);
  if (!keywords) return []; // No shopping intent detected by AI

  if (!accessKey || !secretKey || !partnerTag) {
    console.error('[amazonDica] Amazon env not set');
    return [];
  }

  const items = await searchAmazonProducts(keywords);

  if (!items.length) {
    const { answer } = await perplexityService.search(message + " Amazon EUA");
    if (answer) {
      return [`🛒 Não achei produtos na Amazon, mas aqui vai uma dica extra:\n${answer}`];
    } else {
      return [];
    }
  }

  return [replyHelper.amazon([items[0]]).content];
};