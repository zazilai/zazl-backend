// helpers/profile.js

const { admin } = require('./firebase');
const db = admin.firestore();

// Loads user profile or creates it if new; tracks trial status.
async function load(db, waNumber) {
  const doc = db.collection('profiles').doc(waNumber);
  let wasNew = false;
  const snap = await doc.get();
  if (!snap.exists) {
    // New user, create basic profile with trial
    await doc.set({
      plan: 'trial',
      usage: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      trialStart: admin.firestore.FieldValue.serverTimestamp()
    });
    wasNew = true;
  }
  return { wasNew };
}

async function getQuotaStatus(db, waNumber) {
  const doc = db.collection('profiles').doc(waNumber);
  const snap = await doc.get();
  if (!snap.exists) {
    return { allowed: true, plan: 'trial', used: 0, limit: 15 };
  }
  const data = snap.data();
  let plan = data.plan || 'trial';
  let used = (data.usage && data.usage[getToday()]) || 0;
  let limit = plan === 'pro' ? 99999 : 15;
  if (plan === 'free') limit = 10;
  if (plan === 'trial') limit = 15;
  return {
    allowed: used < limit,
    plan,
    used,
    limit
  };
}

async function updateUsage(db, waNumber, tokens) {
  const doc = db.collection('profiles').doc(waNumber);
  const snap = await doc.get();
  if (!snap.exists) return;
  const data = snap.data();
  const usage = data.usage || {};
  const today = getToday();
  usage[today] = (usage[today] || 0) + 1;
  await doc.set(
    {
      usage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  load,
  getQuotaStatus,
  updateUsage
};