// helpers/amazon.js
const crypto = require('crypto');
const axios = require('axios');

const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;
const SERVICE = 'ProductAdvertisingAPI';

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = 'zazilai-20';

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign(Buffer.from('AWS4' + key, 'utf8'), dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

async function searchAmazonProducts(query) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\..*/g, '') + 'Z';
  const dateStamp = amzDate.substring(0, 8);

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

  const canonicalRequest = [
    'POST',
    '/paapi5/searchitems',
    '',
    `content-encoding:utf-8`,
    `content-type:application/json; charset=utf-8`,
    `host:${HOST}`,
    `x-amz-date:${amzDate}`,
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems`,
    '',
    [
      'content-encoding:utf-8',
      'content-type:application/json; charset=utf-8',
      `host:${HOST}`,
      `x-amz-date:${amzDate}`,
      'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
    ].sort().join('\n'),
    crypto.createHash('sha256').update(payloadJson).digest('hex')
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, SERVICE);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;

  try {
    const response = await axios.post(ENDPOINT, payloadJson, {
      headers: {
        'Content-Encoding': 'utf-8',
        'Content-Type': 'application/json; charset=utf-8',
        'Host': HOST,
        'X-Amz-Date': amzDate,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
        'Authorization': authorizationHeader
      }
    });

    const items = response.data.SearchResult?.Items || [];
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    })).filter(item => item.title && item.url);

  } catch (err) {
    console.error('[Amazon API error]', err.response?.data || err.message);
    return [];
  }
}

module.exports = {
  searchAmazonProducts
};
