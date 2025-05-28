/**
 * Temporary intent detector – always returns 'GENERIC'
 * We’ll replace with OpenAI function-calling later.
 */
module.exports = async (text = '') => 'GENERIC';
