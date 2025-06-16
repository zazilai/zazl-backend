// helpers/amazon.js
const ProductAdvertisingAPIv1 = require('paapi5-nodejs-sdk');
require('dotenv').config();

const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const MARKET = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';

const defaultClient = ProductAdvertisingAPIv1.ApiClient.instance;
defaultClient.accessKey = ACCESS_KEY;
defaultClient.secretKey = SECRET_KEY;
defaultClient.host = HOST;
defaultClient.region = REGION;

const api = new ProductAdvertisingAPIv1.DefaultApi();

async function searchAmazonProducts(query) {
  const searchItemsRequest = new ProductAdvertisingAPIv1.SearchItemsRequest();
  searchItemsRequest['PartnerTag'] = PARTNER_TAG;
  searchItemsRequest['PartnerType'] = 'Associates';
  searchItemsRequest['Keywords'] = query;
  searchItemsRequest['SearchIndex'] = 'All'; // "All" is usually the default; you can make it smarter if you want
  searchItemsRequest['ItemCount'] = 3; // Limit to 3 items for clean WhatsApp UI
  searchItemsRequest['Resources'] = [
    'ItemInfo.Title',
    'Offers.Listings.Price',
    'Images.Primary.Large',
    'DetailPageURL'
  ];

  try {
    const data = await api.searchItems(searchItemsRequest);
    const items = data.SearchResult?.Items || [];
    return items.map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
      image: item.Images?.Primary?.Large?.URL,
      url: item.DetailPageURL
    }));
  } catch (error) {
    // The SDK has nice error objects:
    console.error('[Amazon API fallback] fetch failed:', error);
    return [];
  }
}

module.exports = { searchAmazonProducts };