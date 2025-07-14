// helpers/agentTools.js — Agentic Tool Calling with Parallel Support (July 2025)

const amazonDica = require('./partners/amazonDica');
const eventsDica = require('./partners/eventsDica');
const remitlyDica = require('./partners/remitlyDica');

// Execute tools in parallel if multiple
async function executeTool(toolCall) {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  let toolResponse = '';
  if (functionName === 'searchAmazon') {
    toolResponse = await amazonDica(args.keywords, args.city);
  } else if (functionName === 'searchEvents') {
    toolResponse = await eventsDica(args.query, args.city);
  } else if (functionName === 'getCurrency') {
    toolResponse = await remitlyDica(args.query, args.city);
  }
  return toolResponse;
}

module.exports = { executeTool };