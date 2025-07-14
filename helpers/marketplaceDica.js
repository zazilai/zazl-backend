// helpers/marketplaceDica.js — Intent-Driven, Dynamic Partners (July 2025)

const { admin } = require('./firebase');
const db = admin.firestore();
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica');

// Load dynamic partners from Firestore (easy to add: admin console or form)
async function loadPartners() {
  const snap = await db.collection('partners').get();
  return snap.docs.map(doc => doc.data());
}

// Detect intent (reused from memory)
async function detectIntent(message) {
  // Same as in memory.js
}

// Main
module.exports = async function getMarketplaceDica({ message, city, context }) {
  const intent = await detectIntent(message);
  let dica = '';

  if (intent === 'shopping') {
    dica = await amazonDica(message, city, context, intent);
  } else if (intent === 'event') {
    dica = await eventsDica(message, city, context, intent);
  } else if (intent === 'fx') {
    dica = await remitlyDica(message, city, context, intent);
  } else {
    const partners = await loadPartners();
    for (const partner of partners) {
      if (message.toLowerCase().includes(partner.keyword)) {
        dica = partner.dicaTemplate.replace('{city}', city || 'sua cidade');
        break;
      }
    }
  }

  return dica;
};