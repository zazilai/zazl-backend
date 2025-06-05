// helpers/profile.js
const admin = require('firebase-admin');

const DEFAULT_PLAN = 'trial';
const DAILY_LIMITS = {
  free: 0,
  trial: 15,
  lite: 15,
  pro: Infinity
};

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function load(db, phone) {
  console.log('[profile.js] load() triggered for:', phone);
  const ref = admin.firestore().collection('profiles').doc(phone);
  const snap = await ref.get();

  if (!snap.exists) {
    const now = new Date();
    console.log('[profile.js] Creating new profile doc for', phone);
    await ref.set({
      phone,
      lang: 'pt',
      plan: DEFAULT_PLAN,
      usage: {},
      createdAt: now,
      trialStart: now,
      planExpires: addDays(now, 7),
      showWelcome: true
    });
    return { isNew: true };
  }

  const data = snap.data();
  const today = getTodayKey();

  if (!data.usage || !data.usage[today]) {
    console.log("[profile.js] Initializing today's usage for", phone);
    await ref.update({
      [`usage.${today}`]: 0
    });
  }

  if (data.showWelcome) {
    return { isNew: true };
  }

  return { isNew: false };
}

async function updateUsage(db, phone, tokensUsed = 0) {
  const ref = admin.firestore().collection('profiles').doc(phone);
  const today = getTodayKey();

  await ref.update({
    [`usage.${today}`]: admin.firestore.FieldValue.increment(1),
    showWelcome: false
  });
}

async function getQuotaStatus(db, phone) {
  const ref = admin.firestore().collection('profiles').doc(phone);
  const snap = await ref.get();
  if (!snap.exists) return { allowed: false, plan: 'free', used: 0 };

  const data = snap.data();
  let plan = data.plan || DEFAULT_PLAN;
  const today = getTodayKey();
  const used = data.usage?.[today] || 0;
  let allowed = false;

  if (plan === 'trial' && data.planExpires) {
    const expires = new Date(data.planExpires.toDate ? data.planExpires.toDate() : data.planExpires);
    const now = new Date();
    if (now > expires) {
      console.log('[profile.js] Trial expired. Downgrading user to free:', phone);
      await ref.update({ plan: 'free' });
      plan = 'free';
    }
  }

  allowed = used < (DAILY_LIMITS[plan] || 0);
  return { allowed, plan, used };
}

module.exports = {
  load,
  updateUsage,
  getQuotaStatus
};