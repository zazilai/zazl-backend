// helpers/partners/amazonDica.js

const axios = require('axios');
const crypto = require('crypto');
const replyHelper = require('../reply');

const accessKey = process.env.AMAZON_PA_ACCESS_KEY;
const secretKey = process.env.AMAZON_PA_SECRET_KEY;
const partnerTag = process.env.AMAZON_PA_PARTNER_TAG;
const marketplace = process.env.AMAZON_PA_MARKET || 'www.amazon.com';

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

// --- Amazon Product Advertising API search ---
async function searchAmazonProducts(query) {
  const region = 'us-east-1';
  const service = 'ProductAdvertisingAPI';
  const host = 'webservices.amazon.com';
  const endpoint = `https://${host}/paapi5/searchitems`;
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

  const payload = {
    "Keywords": query,
    "PartnerTag": partnerTag,
    "PartnerType": "Associates",
    "Marketplace": marketplace,
    "Resources": [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "Offers.Listings.Price"
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

  const response = await axios.post(endpoint, payload, { headers });
  const items = response.data.SearchResult?.Items || [];
  return items.map(item => ({
    title: item.ItemInfo?.Title?.DisplayValue,
    price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
    url: item.DetailPageURL,
    image: item.Images?.Primary?.Medium?.URL
  })).filter(i => i.title && i.url);
}

// Main
module.exports = async function amazonDica(message, city, context, intent) {
  // Only run if the question is about products/shopping
  if (
    intent !== 'AMAZON' &&
    !/\b(comprar|produto|preço|quanto custa|amazon|onde|loja)\b/i.test(message)
  ) return [];

  if (!accessKey || !secretKey || !partnerTag) return [];

  try {
    const items = await searchAmazonProducts(message);
    if (!items.length) return [];
    // Only ONE top dica (best product)
    return [replyHelper.amazon([items[0]]).content];
  } catch (err) {
    console.error('[amazonDica] API error:', err?.response?.data || err);
    return [];
  }
};