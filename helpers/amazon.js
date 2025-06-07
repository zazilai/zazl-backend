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
  const amzDate = now.toISOString().replace(/[:\-]|