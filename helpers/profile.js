// helpers/profile.js — Zazil, 2025 (Great Product: All-in-one for Profile, Plan, Alerts, Memory)

const { admin } = require('./firebase');
const db = admin.firestore();

// ---- 1. PROFILE LOAD & PLAN/TRIAL LOGIC ----

async function load(db, waNumber) {
  const doc = db.collection('profiles').doc(waNumber);
  let wasNew = false;
  const snap = await doc.get();
  if (!snap.exists) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    await doc.set({
      plan: 'trial',
      usage: {},
      createdAt: now,
      updatedAt: now,
      trialStart: now,
      planExpires: new Date(Date.now() + sevenDays),
      memory: '',
      city: '',
      alerts: []
    });
    wasNew = true;
  }
  return { wasNew };
}

// ---- 2. USAGE / QUOTA MANAGEMENT ----

async function getQuotaStatus(db, waNumber) {
  const doc = db.collection('profiles').doc(waNumber);
  const snap = await doc.get();
  if (!snap.exists) {
    return { allowed: true, plan: 'trial', used: 0, limit: 15 };
  }
  const data = snap.data();
  let plan = data.plan || 'trial';
  let used = (data.usage && data.usage[getToday()]) || 0;
  let limit = plan === 'pro' ? 99999 : (plan === 'free' ? 10 : 15);

  // Enforce trial expiration
  if (plan === 'trial') {
    let expiresAt;
    if (data.planExpires) {
      expiresAt = typeof data.planExpires.toMillis === 'function'
        ? data.planExpires.toMillis()
        : new Date(data.planExpires).getTime();
    }
    if (expiresAt && Date.now() > expiresAt) {
      return { allowed: false, plan, used, limit, reason: 'trial_expired' };
    }
  }

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

// ---- 3. MEMORY & CITY MANAGEMENT ----

// (No extra functions needed here—handled via profile fields, updated in your main flow.)
// Use: db.collection('profiles').doc(waNumber).set({ memory, city }, { merge: true });

async function setMemory(db, waNumber, memory) {
  await db.collection('profiles').doc(waNumber).set({ memory }, { merge: true });
}

async function setCity(db, waNumber, city) {
  await db.collection('profiles').doc(waNumber).set({ city }, { merge: true });
}

// ---- 4. ALERTS / EVENT NOTIFICATIONS ----

async function setPendingAlertOptIn(db, waNumber, city) {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min
  await db.collection('profiles').doc(waNumber).set({
    pendingAlertOptIn: { city, expiresAt }
  }, { merge: true });
}

async function getPendingAlertOptIn(db, waNumber) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  if (!doc.exists) return null;
  const pending = doc.data().pendingAlertOptIn;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    await db.collection('profiles').doc(waNumber).update({ pendingAlertOptIn: admin.firestore.FieldValue.delete() });
    return null;
  }
  return pending;
}

async function clearPendingAlertOptIn(db, waNumber) {
  await db.collection('profiles').doc(waNumber).update({ pendingAlertOptIn: admin.firestore.FieldValue.delete() });
}

async function addAlert(db, waNumber, city) {
  const docRef = db.collection('profiles').doc(waNumber);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  if (!alerts.some(a => a.city?.toLowerCase() === city?.toLowerCase())) {
    alerts.push({ city, type: 'event', createdAt: new Date() });
    await docRef.set({ alerts }, { merge: true });
  }
  await clearPendingAlertOptIn(db, waNumber);
}

async function removeAlert(db, waNumber, city) {
  const docRef = db.collection('profiles').doc(waNumber);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};
  const alerts = Array.isArray(data.alerts)
    ? data.alerts.filter(a => a.city?.toLowerCase() !== city?.toLowerCase())
    : [];
  await docRef.set({ alerts }, { merge: true });
}

async function hasActiveAlert(db, waNumber, city) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  if (!doc.exists) return false;
  const alerts = doc.data().alerts || [];
  return alerts.some(a => a.city?.toLowerCase() === city?.toLowerCase());
}

async function getProfile(db, waNumber) {
  const doc = await db.collection('profiles').doc(waNumber).get();
  return doc.exists ? doc.data() : {};
}

module.exports = {
  load,
  getQuotaStatus,
  updateUsage,
  setMemory,
  setCity,
  setPendingAlertOptIn,
  getPendingAlertOptIn,
  clearPendingAlertOptIn,
  addAlert,
  removeAlert,
  hasActiveAlert,
  getProfile
};