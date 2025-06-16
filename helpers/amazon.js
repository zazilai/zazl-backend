// helpers/amazon.js
const axios = require('axios');
const aws4 = require('aws4');

const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const MARKETPLACE = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const HOST = 'webservices.amazon.com';
const URI = '/paapi5/searchitems';

async function searchAmazonProducts(query) {
  const payload = {
    Keywords: query,
    PartnerTag: PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: MARKETPLACE,
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Large',
      'DetailPageURL'
    ]
  };

  // Prepare unsigned request
  const opts = {
    host: HOST,
    method: 'POST',
    url: `https://${HOST}${URI}`,
    path: URI,
    service: 'ProductAdvertisingAPI',
    region: 'us-east-1',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    },
    body: JSON.stringify(payload),
    data: JSON.stringify(payload), // required for aws4+axios compatibility
  };

  // Sign the request
  aws4.sign(opts, {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  });

  try {
    const response = await axios({
      method: 'POST',
      url: opts.url,
      headers: opts.headers,
      data: opts.body,
      timeout: 5000,
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