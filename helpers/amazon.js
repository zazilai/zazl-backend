// helpers/amazon.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;
const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = 'zazilai-20';

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
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\..*/g, '');
  const dateStamp = amzDate.slice(0, 8);

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

  const headers = {
    host: HOST,
    'content-type': 'application/json; charset=utf-8',
    'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    'x-amz-date': amzDate,
    'x-amz-content-sha256': crypto.createHash('sha256').update(payloadJson).digest('hex')
  };

  const canonicalHeaders = `content-type:${headers['content-type']}\nhost:${headers['host']}\nx-amz-content-sha256:${headers['x-amz-content-sha256']}\nx-amz-date:${headers['x-amz-date']}\nx-amz-target:${headers['x-amz-target']}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target';
  const canonicalRequest = `POST\n/paapi5/searchitems\n\n${canonicalHeaders}\n${signedHeaders}\n${headers['x-amz-content-sha256']}`;

  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, 'ProductAdvertisingAPI');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        ...headers,
        Authorization: authorizationHeader
      },
      body: payloadJson
    });

    const data = await response.json();

    if (!response.ok || data.Errors) {
      console.error('[Amazon API fallback] Amazon API error:', data.Errors || data);
      return null; // triggers fallback
    }

    const items = data.SearchResult?.Items || [];
    return items.slice(0, 3).map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    }));
  } catch (err) {
    console.error('[Amazon API fallback] fetch failed:', err);
    return null; // triggers fallback
  }
}

module.exports = { searchAmazonProducts };
