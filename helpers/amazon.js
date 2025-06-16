// helpers/amazon.js
const AmazonPaapi = require('amazon-pa-api50');

const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const MARKET = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const REGION = 'us-east-1';

const client = new AmazonPaapi.AmazonApiClient({
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
  partnerTag: PARTNER_TAG,
  region: REGION,
  host: MARKET,
});

async function searchAmazonProducts(query) {
  try {
    const result = await client.searchItems({
      Keywords: query,
      SearchIndex: 'All',
      ItemCount: 3,
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Images.Primary.Large',
        'DetailPageURL'
      ],
    });
    const items = result.ItemsResult?.Items || [];
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue || '',
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || '',
      image: item.Images?.Primary?.Large?.URL || '',
      url: item.DetailPageURL || ''
    }));
  } catch (err) {
    console.error('[Amazon API fallback] fetch failed:', {
      message: err.message,
      data: err.response?.data,
      query
    });
    return [];
  }
}

module.exports = { searchAmazonProducts };