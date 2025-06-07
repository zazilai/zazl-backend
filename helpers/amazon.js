// helpers/amazon.js
const axios = require('axios');
const crypto = require('crypto');

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;
const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign(`AWS4${key}`, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

async function searchAmazonProducts(query) {
  const payload = {
    Keywords: query,
    PartnerTag: PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.com',
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Large',
      'DetailPageURL',
    ],
  };

  const payloadJson = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${HOST}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date';
  const canonicalRequest = `POST\n/paapi5/searchitems\n\n${canonicalHeaders}\n${signedHeaders}\n${crypto.createHash('sha256').update(payloadJson).digest('hex')}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, 'ProductAdvertisingAPI');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'Content-Encoding': 'amz-1.0',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Amz-Date': amzDate,
    Authorization: authorizationHeader,
  };

  try {
    const response = await axios.post(ENDPOINT, payload, { headers });
    return response.data.ItemsResult?.Items || [];
  } catch (err) {
    console.error('[Amazon API error]', err.message);
    return [];
  }
}

module.exports = {
  searchAmazonProducts,
};