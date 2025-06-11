// helpers/amazon.js
const crypto = require('crypto');
const axios = require('axios');

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = 'zazilai-20';
const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';
const URI = '/paapi5/searchitems';
const ENDPOINT = `https://${HOST}${URI}`;

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, date, region, service) {
  const kDate = sign(Buffer.from('AWS4' + key, 'utf8'), date);
  const kRegion = sign(kDate, region);
  const kService = sign(kRegion, service);
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
      'DetailPageURL'
    ]
  };

  const payloadJson = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\..*/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'host': HOST,
    'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    'x-amz-date': amzDate,
    'x-amz-content-sha256': crypto.createHash('sha256').update(payloadJson).digest('hex'),
  };

  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join('\n') + '\n';

  const signedHeaders = Object.keys(headers).sort().join(';');

  const canonicalRequest = `POST\n${URI}\n\n${canonicalHeaders}\n${signedHeaders}\n${headers['x-amz-content-sha256']}`;

  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, 'ProductAdvertisingAPI');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await axios.post(ENDPOINT, payloadJson, {
      headers: {
        ...headers,
        Authorization: authorizationHeader
      }
    });

    const items = response.data?.SearchResult?.Items || [];
    return items.slice(0, 3).map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    }));
  } catch (err) {
    console.error('[Amazon API fallback] fetch failed:', {
      message: err.message,
      data: err.response?.data,
      query
    });
    return []; // Always return array, never null
  }
}

module.exports = { searchAmazonProducts };