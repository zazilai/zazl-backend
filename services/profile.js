/**
 * Stubbed user profile service.
 * Later we’ll connect this to Firestore.
 */
module.exports = {
  load: async (_db, _waNumber) => ({ plan: 'FREE' }),
  updateUsage: async (_db, _waNumber, _tokens) => {}
};
