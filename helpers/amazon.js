// helpers/amazon.js
const aws4 = require('aws4');
const axios = require('axios');

const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG || 'zazilai-20';
const MARKETPLACE = process.env.AMAZON_PA_MARKET || 'www.amazon.com';

const HOST = 'webservices.amazon.com';
const REGION = 'us-east-1';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

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

  const requestOptions = {
    host: HOST,
    method: 'POST',
    url: ENDPOINT,
    path: '/paapi5/searchitems',
    service: 'ProductAdvertisingAPI',
    region: REGION,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload)
  };

  // Sign the request with aws4
  aws4.sign(requestOptions, {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY
  });

  try {
    const response = await axios.post(
      ENDPOINT,
      payload,
      { headers: requestOptions.headers }
    );

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