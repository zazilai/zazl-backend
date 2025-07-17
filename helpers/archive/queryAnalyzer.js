// helpers/queryAnalyzer.js — Great Product, 2025-Compliant

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class QueryAnalyzer {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  // Main analysis function
  async analyze(query, context = {}) {
    try {
      const cacheKey = `${query}-${context.city || ''}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('[QueryAnalyzer] Cache hit');
        return cached.data;
      }

      const contextInfo = {
        city: context.city || null,
        hasMemory: !!context.memory,
        timezone: context.timezone || 'America/Chicago',
        currentTime: new Date().toLocaleString('pt-BR', {
          timeZone: context.timezone || 'America/Chicago'
        })
      };

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `
Analyze the user query for a Brazilian AI assistant serving expats.
Return JSON with these exact fields:
{
  "intent": "shopping|events|currency|news|immigration|service|creative|general",
  "needsCurrentInfo": true/false,
  "needsLocation": true/false,
  "needsTemporal": true/false,
  "confidence": 0.0-1.0,
  "entities": {
    "product": null or "product name",
    "location": null or "extracted location",
    "timeframe": null or "temporal reference",
    "service": null or "service type"
  },
  "suggestedTools": ["tool1", "tool2"],
  "reasoning": "brief explanation"
}
            `.trim()
          },
          {
            role: 'user',
            content: `Query: "${query}"\nContext: ${JSON.stringify(contextInfo)}`
          }
        ]
      });

      const analysis = JSON.parse(response.choices[0].message.content);

      this.cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      if (this.cache.size > 100) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }

      console.log(`[QueryAnalyzer] Intent: ${analysis.intent}, Confidence: ${analysis.confidence}`);
      return analysis;
    } catch (error) {
      console.error('[QueryAnalyzer] Analysis error:', error);
      return {
        intent: 'general',
        needsCurrentInfo: false,
        needsLocation: false,
        needsTemporal: false,
        confidence: 0.5,
        entities: {},
        suggestedTools: [],
        reasoning: 'Fallback due to analysis error'
      };
    }
  }

  // Check if query needs current info
  async needsCurrentInfo(query) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 10,
        messages: [
          {
            role: 'system',
            content: 'Does this query need current/recent information (news, prices, live events)? Reply only "yes" or "no".'
          },
          { role: 'user', content: query }
        ]
      });

      return response.choices[0].message.content.trim().toLowerCase() === 'yes';
    } catch (error) {
      console.error('[QueryAnalyzer] Current info check error:', error);
      return false;
    }
  }

  // Enhance query with context
  async enhanceQuery(query, context = {}) {
    try {
      const analysis = await this.analyze(query, context);
      let enhanced = query;

      if (analysis.needsLocation && context.city && !analysis.entities.location) {
        enhanced = `${query} em ${context.city}`;
      }

      if (analysis.needsTemporal && !analysis.entities.timeframe) {
        const now = new Date();
        const timeStr = now.toLocaleString('pt-BR', {
          timeZone: context.timezone || 'America/Chicago',
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
        enhanced = `${enhanced} (hoje ${timeStr})`;
      }

      return {
        original: query,
        enhanced,
        analysis
      };
    } catch (error) {
      console.error('[QueryAnalyzer] Enhancement error:', error);
      return {
        original: query,
        enhanced: query,
        analysis: null
      };
    }
  }

  // Determine which AI service should handle this query
  async routeQuery(query, context = {}) {
    const analysis = await this.analyze(query, context);

    if (analysis.needsCurrentInfo || analysis.intent === 'news') {
      return 'perplexity';
    }
    if (analysis.intent === 'creative' || analysis.confidence < 0.7) {
      return 'gpt4o';
    }
    return 'grok4';
  }

  // Extract key information
  async extractKeyInfo(query) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `
Extract key information from the query.
Return JSON:
{
  "hasCity": true/false,
  "city": "city name or null",
  "hasDate": true/false,
  "date": "date reference or null",
  "hasProduct": true/false,
  "product": "product name or null",
  "language": "pt|en|mixed"
}
            `.trim()
          },
          { role: 'user', content: query }
        ]
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('[QueryAnalyzer] Extraction error:', error);
      return {
        hasCity: false,
        city: null,
        hasDate: false,
        date: null,
        hasProduct: false,
        product: null,
        language: 'pt'
      };
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    console.log('[QueryAnalyzer] Cache cleared');
  }
}

module.exports = new QueryAnalyzer();