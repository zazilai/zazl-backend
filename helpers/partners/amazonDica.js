// helpers/partners/amazonDica.js — Great Product Version with Smart Retries & Dynamic Fallback

const axios = require('axios');
const crypto = require('crypto');
const replyHelper = require('../reply');
const { OpenAI } = require('openai');
const perplexityService = require('../perplexity');

const accessKey = process.env.AMAZON_PA_ACCESS_KEY;
const secretKey = process.env.AMAZON_PA_SECRET_KEY;
const partnerTag = process.env.AMAZON_PA_PARTNER_TAG;
const marketplace = process.env.AMAZON_PA_MARKET || 'www.amazon.com';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Retry helper with exponential backoff
async function withRetries(fn, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.response?.status === 429 && i < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 8000); // 1s, 2s, 4s, max 8s
        console.log(`[AmazonDica] Rate limited - retry ${i + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (err.response?.status !== 429) {
        throw err; // Don't retry non-429 errors
      }
    }
  }
  throw lastError;
}

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign('AWS4' + key, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

// Enhanced keyword extraction
async function detectAndExtractKeywords(message, city) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `Detect shopping intent and extract search keywords.
Return format: intent:sim|não; keywords:search terms; product:main product name

For Brazilian products, include English equivalents:
- "farofa" → keywords:farofa cassava flour yoki; product:farofa
- "pão de queijo" → keywords:brazilian cheese bread mix; product:pão de queijo
- "guaraná" → keywords:guarana antarctica soda brazilian; product:guaraná`
        },
        { role: 'user', content: message + (city ? ` (em ${city})` : '') }
      ]
    });
    
    const content = response.choices[0].message.content.trim();
    console.log(`[AmazonDica] Detection result: ${content}`);
    
    const intentMatch = content.match(/intent:(sim|n[ãa]o)/i);
    const keywordsMatch = content.match(/keywords:([^;]+)/i);
    const productMatch = content.match(/product:([^;]+)/i);
    
    if (intentMatch?.[1].toLowerCase() === 'sim' && keywordsMatch?.[1]) {
      return {
        keywords: keywordsMatch[1].trim(),
        product: productMatch?.[1]?.trim() || keywordsMatch[1].trim()
      };
    }
    return null;
  } catch (err) {
    console.error('[AmazonDica] Intent error:', err);
    return null;
  }
}

// Smart dynamic fallback using Perplexity + AI formatting
async function getSmartProductRecommendations(product, city, originalMessage) {
  try {
    console.log(`[AmazonDica] Creating smart fallback for ${product} in ${city}`);
    
    // Dynamic query based on actual product and city
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const searchQuery = `Where to buy ${product} in ${city} ${currentMonth}. 
                        Include: Brazilian grocery stores with addresses, 
                        specific supermarkets with international aisles,
                        online options including direct Amazon links,
                        local tips for finding ${product}.
                        Focus on actionable information with store names and locations.`;
    
    const { answer } = await perplexityService.search(searchQuery, city);
    
    if (!answer || answer.length < 100) {
      // If Perplexity fails, at least provide a helpful response
      return `🛒 **Procurando ${product}${city ? ` em ${city}` : ''}:**\n\n` +
             `🔍 Tente:\n` +
             `• Amazon: amazon.com/s?k=${encodeURIComponent(product + ' brazilian')}\n` +
             `• Google Maps: Busque "Brazilian store near me"\n` +
             `• Facebook: Grupo "Brasileiros em ${city || 'sua cidade'}"\n` +
             `• Mercados latinos geralmente têm produtos brasileiros\n\n` +
             `💡 Dica: ${product} às vezes está listado como "${product.includes('farofa') ? 'cassava flour' : product}" em inglês!`;
    }
    
    // Use AI to format the response beautifully
    const formattedResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `Format this information as a helpful WhatsApp message for finding ${product}.
Structure:
🛒 Header mentioning ${product} in ${city}
📍 Physical stores (with specific names and areas)
🌐 Online options (with actual links if mentioned)
💡 One practical tip

Keep concise, use emojis, make it actionable. If addresses are mentioned, include them.`
        },
        {
          role: 'user',
          content: answer
        }
      ]
    });
    
    return formattedResponse.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('[AmazonDica] Smart fallback error:', error);
    // Ultra fallback
    return `💡 **Dica do Zazil para ${product}:**\n\n` +
           `🛒 Busque online: amazon.com/s?k=${encodeURIComponent(product)}\n` +
           `📍 Ou procure "Brazilian grocery" no Google Maps\n` +
           `💬 Pergunte no grupo de brasileiros local!`;
  }
}

// Amazon API call with signature
async function searchAmazonProducts(keywords) {
  // ... (keep all the signature code as is) ...
  
  try {
    return await withRetries(async () => {
      console.log(`[AmazonDica] Searching Amazon for: ${keywords}`);
      const response = await axios.post(endpoint, payload, { headers, timeout: 5000 });
      
      const items = response.data.SearchResult?.Items || [];
      console.log(`[AmazonDica] Found ${items.length} items`);
      
      return items.map(item => ({
        title: item.ItemInfo?.Title?.DisplayValue,
        price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount,
        url: item.DetailPageURL,
        image: item.Images?.Primary?.Medium?.URL
      })).filter(i => i.title && i.url && i.price);
    });
  } catch (err) {
    console.error('[AmazonDica] All retries failed:', err.message);
    return [];
  }
}

// Main function
module.exports = async function amazonDica(message, city, context, source) {
  try {
    // Extract keywords and product name
    const extracted = await detectAndExtractKeywords(message, city);
    if (!extracted) return '';
    
    const { keywords, product } = extracted;
    console.log(`[AmazonDica] Product: ${product}, Keywords: ${keywords}`);
    
    // Try Amazon with retries
    const items = await searchAmazonProducts(keywords);
    
    // If we got products, format and return
    if (items.length > 0) {
      const formatted = replyHelper.amazon(items).content;
      console.log(`[AmazonDica] Success! Returning ${items.length} products`);
      return formatted;
    }
    
    // No products found - use smart dynamic fallback
    console.log(`[AmazonDica] No Amazon results, using smart fallback`);
    const smartRecommendations = await getSmartProductRecommendations(
      product,
      city,
      message
    );
    
    return smartRecommendations;
    
  } catch (error) {
    console.error('[AmazonDica] Critical error:', error);
    // Even on critical failure, try to help
    return `💡 **Dica do Zazil:**\n\n` +
           `Busque "${message}" em:\n` +
           `• Amazon.com\n` +
           `• Google Maps (lojas brasileiras)\n` +
           `• Grupos do Facebook local`;
  }
};