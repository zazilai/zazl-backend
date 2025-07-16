// helpers/agentTools.js — Agentic Tool Calling with Parallel Support (July 2025)

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica');
const axios = require('axios');

const tools = [
  {
    type: 'function',
    function: {
      name: 'searchAmazon',
      description: 'Search Amazon for products with affiliate link.',
      parameters: {
        type: 'object',
        properties: {
          keywords: { type: 'string', description: 'Search keywords' },
          city: { type: 'string', description: 'User city for localization' }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchEvents',
      description: 'Search for Brazilian events in user city.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'User city' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurrency',
      description: 'Get currency exchange rates.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getImmigrationChecklist',
      description: 'Get immigration checklists/forms from USCIS API.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Type e.g. "green card" or "passport renewal" or form number like "i-360"' }
        },
        required: ['type']
      }
    }
  }
];

// Execute
async function executeTool(toolCall) {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  let toolResponse = '';
  if (functionName === 'searchAmazon') {
    toolResponse = await amazonDica(args.keywords, args.city);
  } else if (functionName === 'searchEvents') {
    toolResponse = await eventsDica('', args.city);
  } else if (functionName === 'getCurrency') {
    toolResponse = await remitlyDica('', args.city);
  } else if (functionName === 'getImmigrationChecklist') {
    try {
      const query = args.type.toLowerCase().includes('i-360') ? 'i-360' : args.type; // Better query handling
      const res = await axios.get(`https://www.uscis.gov/api/v1/forms?keywords=${encodeURIComponent(query)}`, { timeout: 5000 });
      const forms = res.data.forms || [];
      if (!forms.length) {
        toolResponse = 'No checklists found on USCIS for "' + args.type + '"—check uscis.gov/forms directly.';
      } else {
        toolResponse = forms.slice(0, 3).map(f => `${f.title}: ${f.description.slice(0, 100)}... Link: ${f.url}`).join('\n');
      }
    } catch (err) {
      toolResponse = 'Unable to fetch USCIS checklist—visit uscis.gov/forms.';
    }
  }
  return toolResponse;
}

module.exports = { tools, executeTool };