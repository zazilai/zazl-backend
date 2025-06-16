// helpers/amazon.js
const ProductAdvertisingAPIv1 = require('paapi5-nodejs-sdk');

// Environment variables (from Render)
const ACCESS_KEY = process.env.AMAZON_PA_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_PA_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PA_PARTNER_TAG;
const MARKETPLACE = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const REGION = 'us-east-1';
const HOST = 'webservices.amazon.com';

// Initialize the API client
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
  searchItemsRequest['Marketplace'] = MARKETPLACE;
  searchItemsRequest['Keywords'] = query;
  searchItemsRequest['SearchIndex'] = 'All'; // 'All' is default, but explicitly set for clarity
  searchItemsRequest['ItemCount'] = 3; // Limit to top 3 for WhatsApp
  searchItemsRequest['Resources'] = [
    'ItemInfo.Title',
    'Offers.Listings.Price',
    'Images.Primary.Large',
    'DetailPageURL'
  ];

  try {
    const data = await api.searchItems(searchItemsRequest);
    const items = data.SearchResult?.Items || [];
    return items.slice(0, 3).map(item => ({
      title: item.ItemInfo?.Title?.DisplayValue || '',
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || '',
      image: item.Images?.Primary?.Large?.URL || '',
      url: item.DetailPageURL || ''
    }));
  } catch (error) {
    // Log structured error for easier debugging
    console.error('[Amazon API fallback] fetch failed:', {
      message: error.message,
      data: error.response ? error.response.text : undefined,
      query
    });
    return [];
  }
}

module.exports = { searchAmazonProducts };