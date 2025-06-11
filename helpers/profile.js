// helpers/profile.js

const admin = require('firebase-admin');
const db = admin.firestore();

const MEMORY_MAX = 10;

async function load(db, waNumber) {
  const ref = db.collection('profiles').doc(waNumber);
  const snap = await ref.get();
  let wasNew = false;
  if (!snap.exists) {
    // Create on first use
    await ref.set({
      plan: 'trial',
      usage: 0,
      memory: [],
      summary: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    wasNew = true;
  }
  return { wasNew };
}

async function getQuotaStatus(db, waNumber) {
  const ref = db.collection('profiles').doc(waNumber);
  const snap = await ref.get();
  const data = snap.data() || {};
  // Same quota logic as before
  if (['pro'].includes(data.plan)) return { allowed: true };
  // trial/lite plan limits: 15 per day, reset logic can be improved
  const usage = data.usage || 0;
  return { allowed: usage < 15 };
}

async function updateUsage(db, waNumber, tokens = 0) {
  const ref = db.collection('profiles').doc(waNumber);
  await ref.update({
    usage: admin.firestore.FieldValue.increment(1),
    tokens: admin.firestore.FieldValue.increment(tokens),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function loadMemory(db, waNumber) {
  const ref = db.collection('profiles').doc(waNumber);
  const snap = await ref.get();
  return (snap.data() && snap.data().memory) ? snap.data().memory : [];
}

async function saveMemory(db, waNumber, role, content) {
  const ref = db.collection('profiles').doc(waNumber);
  const snap = await ref.get();
  let mem = (snap.data() && snap.data().memory) ? snap.data().memory : [];
  mem.push({ role, content, ts: new Date().toISOString() });
  if (mem.length > MEMORY_MAX) mem = mem.slice(-MEMORY_MAX);
  await ref.update({ memory: mem });
}

async function wipeMemory(db, waNumber) {
  const ref = db.collection('profiles').doc(waNumber);
  await ref.update({ memory: [], summary: '' });
}

// Placeholders for summary (phase 4+)
async function loadSummary(db, waNumber) {
  const ref = db.collection('profiles').doc(waNumber);
  const snap = await ref.get();
  return (snap.data() && snap.data().summary) ? snap.data().summary : '';
}

async function saveSummary(db, waNumber, summary) {
  const ref = db.collection('profiles').doc(waNumber);
  await ref.update({ summary });
}

module.exports = {
  load,
  getQuotaStatus,
  updateUsage,
  loadMemory,
  saveMemory,
  wipeMemory,
  loadSummary,
  saveSummary
};