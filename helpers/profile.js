// helpers/profile.js
const admin = require('firebase-admin');
const db = admin.firestore();

const DEFAULT_PLAN = 'free';
const DAILY_LIMITS = {
  free: 0,
  lite: 15,
  pro: Infinity
};

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function load(db, phone) {
  const ref = db.collection('profiles').doc(phone);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      phone,
      lang: 'pt',
      plan: DEFAULT_PLAN,
      usage: {},
      createdAt: new Date()
    });
    return;
  }

  const data = snap.data();
  const today = getTodayKey();

  if (!data.usage || !data.usage[today]) {
    await ref.update({
      [`usage.${today}`]: 0
    });
  }
}

async function updateUsage(db, phone, tokensUsed = 0) {
  const ref = db.collection('profiles').doc(phone);
  const today = getTodayKey();
  await ref.update({
    [`usage.${today}`]: admin.firestore.FieldValue.increment(1)
  });
}

async function getQuotaStatus(db, phone) {
  const ref = db.collection('profiles').doc(phone);
  const snap = await ref.get();
  if (!snap.exists) return { allowed: false, plan: 'free', used: 0 };

  const data = snap.data();
  const plan = data.plan || DEFAULT_PLAN;
  const today = getTodayKey();
  const used = data.usage?.[today] || 0;
  const allowed = used < (DAILY_LIMITS[plan] || 0);

  return { allowed, plan, used };
}

module.exports = {
  load,
  updateUsage,
  getQuotaStatus
};