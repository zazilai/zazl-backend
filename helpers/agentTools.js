// helpers/agentTools.js — Agentic Tool System (Production Ready)

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica');
const axios = require('axios');

// Tool definitions with rich descriptions
const tools = [
  {
    type: 'function',
    function: {
      name: 'searchAmazon',
      description:
        'Search Amazon for products and return affiliate links. Use when user asks about buying products, prices, or where to find items.',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description: 'Product search keywords'
          },
          city: {
            type: 'string',
            description: 'User city for shipping context (optional)'
          }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchEvents',
      description:
        'Search for Brazilian events and cultural activities. Use when user asks about events, parties, shows, or things to do.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'City to search events in'
          },
          query: {
            type: 'string',
            description: 'Optional specific event type or keywords'
          }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurrencyRate',
      description:
        'Get current USD to BRL exchange rate. Use when user asks about dollar rate, currency exchange, or sending money to Brazil.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Optional amount to convert'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchServices',
      description:
        'Search for Brazilian services and businesses in a city. Use for professional services, restaurants, stores, etc.',
      parameters: {
        type: 'object',
        properties: {
          serviceType: {
            type: 'string',
            description: 'Type of service (e.g., "cabeleireiro", "dentista", "mercado brasileiro")'
          },
          city: {
            type: 'string',
            description: 'City to search in'
          }
        },
        required: ['serviceType', 'city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getImmigrationInfo',
      description:
        'Get immigration forms, checklists, and USCIS information. Use for visa, green card, citizenship questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Immigration topic or form number (e.g., "green card", "i-360", "citizenship")'
          }
        },
        required: ['topic']
      }
    }
  }
];

// Tool executor
async function executeTool(toolCall) {
  const functionName = toolCall.function.name;
  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    console.error(`[AgentTools] Invalid arguments for ${functionName}:`, toolCall.function.arguments);
    return formatToolError(functionName, 'Invalid parameters');
  }

  console.log(`[AgentTools] Executing ${functionName} with:`, args);

  try {
    switch (functionName) {
      case 'searchAmazon':
        return await executeAmazonSearch(args);
      case 'searchEvents':
        return await executeEventSearch(args);
      case 'getCurrencyRate':
        return await executeCurrencyRate(args);
      case 'searchServices':
        return await executeServiceSearch(args);
      case 'getImmigrationInfo':
        return await executeImmigrationInfo(args);
      default:
        return formatToolError(functionName, 'Unknown tool');
    }
  } catch (error) {
    console.error(`[AgentTools] Error executing ${functionName}:`, error);
    return formatToolError(functionName, error.message);
  }
}

// Amazon search
async function executeAmazonSearch(args) {
  const { keywords, city } = args;
  const result = await amazonDica(keywords, city || '', '', 'TOOL_CALL');
  if (!result || result.includes('Não encontrei produtos')) {
    return formatEmptyResult('amazon', keywords);
  }
  return result;
}

// Event search (ensure dica format)
async function executeEventSearch(args) {
  const { city, query } = args;
  
  if (!city) {
    return '💡 Dica do Zazil: Para encontrar eventos, preciso saber sua cidade! Me diga onde você está! 🏙️';
  }
  
  console.log(`[AgentTools] Searching events in ${city}`);
  
  const result = await eventsDica(query || 'eventos brasileiros', city, '', 'TOOL_CALL');
  
  // Result is already formatted as dica
  return result || '💡 Dica do Zazil: Não encontrei eventos específicos, mas fique de olho nos grupos locais! 🎉';
}

// Currency rate
async function executeCurrencyRate(args) {
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 3000 });
    const rate = response.data.rates.BRL;
    const amount = args.amount || 1;
    const converted = (amount * rate).toFixed(2);

    let result = `💵 **Cotação do Dólar Agora**\n`;
    result += `1 USD = R$ ${rate.toFixed(2)}\n`;

    if (args.amount && args.amount !== 1) {
      result += `💰 $${amount} = R$ ${converted}\n`;
    }

    result += `\n💸 Envie dinheiro com segurança pela Remitly: https://remit.ly/1bh2ujzp`;

    return result;
  } catch (error) {
    return await remitlyDica('cotação', '', '', 'TOOL_CALL');
  }
}

// Service search
async function executeServiceSearch(args) {
  const { serviceType, city } = args;
  return `🔍 ${serviceType} em ${city}\n\nPara encontrar ${serviceType} brasileiros em ${city}, recomendo:\n\n📱 Facebook Groups: "Brasileiros em ${city}"\n🔎 Google Maps: Busque "${serviceType} brasileiro near me"\n💬 WhatsApp: Grupos da comunidade brasileira local\n📍 Nextdoor: Peça recomendações no app\n\n💡 Dica: Sempre peça referências e compare preços!`;
}

// Immigration info
async function executeImmigrationInfo(args) {
  const { topic } = args;
  try {
    const response = await axios.get(
      `https://www.uscis.gov/api/v1/forms?keywords=${encodeURIComponent(topic)}`,
      { timeout: 5000 }
    );

    const forms = response.data.forms || [];

    if (forms.length === 0) {
      return `📋 Não encontrei formulários específicos para "${topic}".\n\n📌 Recursos úteis:\n- Site oficial: https://www.uscis.gov\n- Central de formulários: https://www.uscis.gov/forms\n- Telefone USCIS: 1-800-375-5283\n\n💡 Dica: Sempre consulte um advogado de imigração para casos específicos!`;
    }

    let result = `📋 **Informações USCIS sobre "${topic}"**\n\n`;

    forms.slice(0, 3).forEach(form => {
      result += `📄 **${form.title}**\n`;
      if (form.description) {
        result += `${form.description.slice(0, 150)}...\n`;
      }
      if (form.url) {
        result += `🔗 Link: ${form.url}\n`;
      }
      result += '\n';
    });

    result += `⚖️ Estas informações são apenas orientação. Consulte um advogado!`;

    return result;
  } catch (error) {
    return formatToolError('immigration', `Erro ao buscar informações sobre "${topic}"`);
  }
}

// Helpers
function formatEmptyResult(toolType, searchTerm) {
  const messages = {
    amazon: `🔍 Não encontrei produtos para "${searchTerm}" na Amazon agora. Tente termos mais específicos ou diferentes!`,
    events: `📅 Não encontrei eventos brasileiros em "${searchTerm}". Procure em grupos do Facebook ou Meetup!`,
    services: `🔍 Não encontrei serviços "${searchTerm}". Tente grupos da comunidade local!`
  };
  return messages[toolType] || 'Não encontrei resultados.';
}

function formatToolError(toolName, error) {
  return `⚠️ Desculpe, tive um problema ao buscar "${toolName}". Detalhes: ${error}. Tente novamente!`;
}

module.exports = {
  tools,
  executeTool,
  executeAmazonSearch,
  executeEventSearch,
  executeCurrencyRate,
  executeServiceSearch,
  executeImmigrationInfo
};