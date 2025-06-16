// helpers/amazon.js

const axios = require('axios');
const crypto = require('crypto');

// Environment variables
const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const MARKET = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';
const HOST = 'webservices.amazon.com';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

// === Signature helpers (AWS SigV4) ===
function hash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

// === Main function ===
async function searchAmazonProducts(query) {
  // 1. Build payload
  const payload = {
    Keywords: query,
    PartnerTag: PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: MARKET,
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

  // 2. Create timestamp and date
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') + 'Z'; // e.g. 20240616T200000Z
  const dateStamp = amzDate.slice(0, 8);

  // 3. Canonical headers and signed headers
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  // 4. Canonical request
  const canonicalRequest =
    'POST\n' +
    '/paapi5/searchitems\n' +
    '\n' +
    canonicalHeaders +
    '\n' +
    signedHeaders +
    '\n' +
    hash(payloadJson);

  // 5. String to sign
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign =
    'AWS4-HMAC-SHA256\n' +
    amzDate + '\n' +
    credentialScope + '\n' +
    hash(canonicalRequest);

  // 6. Calculate signature
  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, SERVICE);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  // 7. Authorization header
  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 8. Final request
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': HOST,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader,
  };

  try {
    const response = await axios.post(ENDPOINT, payloadJson, { headers, timeout: 6000 });
    const items = response.data?.SearchResult?.Items || [];
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    }));
  } catch (error) {
    // Defensive logging for debugging
    console.error('[Amazon API fallback] fetch failed:', {
      message: error?.message,
      data: error?.response?.data,
      query
    });
    return [];
  }
}

module.exports = { searchAmazonProducts };