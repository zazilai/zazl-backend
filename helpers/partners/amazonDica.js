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
    "Marketplace": "www.amazon.com",
    "Resources": [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "ItemInfo.ByLineInfo",
      "Offers.Listings.Price"
    ]
  };
  const payloadStr = JSON.stringify(payload);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = '/paapi5/searchitems';
  const canonicalQuerystring = '';
  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=UTF-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const payloadHash = crypto.createHash('sha256').update(payloadStr, 'utf8').digest('hex');
  const canonicalRequest = [
    'POST', canonicalUri, canonicalQuerystring,
    canonicalHeaders, signedHeaders, payloadHash
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

// MAIN DICA LAYER (no keyword hacks)
module.exports = async function amazonDica(message, city, context, intent) {
  // Only try if Amazon API is configured, and the intent is plausible (AMAZON, GENERIC, or PRODUCT-related Qs).
  if (!accessKey || !secretKey || !partnerTag) return [];

  // For now, always attempt for any question, since deduplication is handled at the orchestrator (and result capped at 3).
  try {
    const items = await searchAmazonProducts(message);
    if (!items || !items.length) return [];
    return items.slice(0, 3).map(item => replyHelper.amazon([item]).content);
  } catch (err) {
    console.error('[amazonDica] API error:', err?.response?.data || err);
    return [];
  }
};