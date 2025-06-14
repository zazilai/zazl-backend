// helpers/profile.js

const { admin } = require('./firebase');
const db = admin.firestore();

// Loads user profile or creates it if new; tracks trial status.
async function load(db, waNumber) {
  const doc = db.collection('profiles').doc(waNumber);
  let wasNew = false;
  const snap = await doc.get();
  if (!snap.exists) {
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

// ---- ALERT / OPT-IN / OPT-OUT LOGIC ----

// Set the pending alert opt-in flag (expires in 5 min)
async function setPendingAlertOptIn(db, waNumber, city) {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min from now
  await db.collection('profiles').doc(waNumber).set({
    pendingAlertOptIn: { city, expiresAt }
  }, { merge: true });
}

// Get pending alert opt-in (and clear if expired)
async function getPendingAlertOptIn(db, waNumber) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  if (!doc.exists) return null;
  const pending = doc.data().pendingAlertOptIn;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    // Expired: clear it
    await db.collection('profiles').doc(waNumber).update({ pendingAlertOptIn: admin.firestore.FieldValue.delete() });
    return null;
  }
  return pending;
}

// Clear pending alert flag
async function clearPendingAlertOptIn(db, waNumber) {
  await db.collection('profiles').doc(waNumber).update({ pendingAlertOptIn: admin.firestore.FieldValue.delete() });
}

// Register alert for a city
async function addAlert(db, waNumber, city) {
  const docRef = db.collection('profiles').doc(waNumber);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  // Avoid duplicates
  if (!alerts.some(a => a.city?.toLowerCase() === city?.toLowerCase())) {
    alerts.push({ city, type: 'event', createdAt: new Date() });
    await docRef.set({ alerts }, { merge: true });
  }
  // Always clear pending after register
  await clearPendingAlertOptIn(db, waNumber);
}

// Remove alert for a city (opt-out)
async function removeAlert(db, waNumber, city) {
  const docRef = db.collection('profiles').doc(waNumber);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};
  const alerts = Array.isArray(data.alerts) ? data.alerts.filter(a => a.city?.toLowerCase() !== city?.toLowerCase()) : [];
  await docRef.set({ alerts }, { merge: true });
}

// Checks if user has active alert for a city
async function hasActiveAlert(db, waNumber, city) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  if (!doc.exists) return false;
  const alerts = doc.data().alerts || [];
  return alerts.some(a => a.city?.toLowerCase() === city?.toLowerCase());
}

// Gets full profile (for pending opt-in and more)
async function getProfile(db, waNumber) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  return doc.exists ? doc.data() : {};
}

module.exports = {
  load,
  getQuotaStatus,
  updateUsage,
  setPendingAlertOptIn,
  getPendingAlertOptIn,
  clearPendingAlertOptIn,
  addAlert,
  removeAlert,
  hasActiveAlert,
  getProfile
};