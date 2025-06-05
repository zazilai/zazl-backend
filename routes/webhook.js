// routes/webhook.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Important: express.raw() must be used before any bodyParser middleware
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const whatsappNumber = session.metadata?.whatsapp_number;
    const planId = session.metadata?.plan || '';

    if (!whatsappNumber || !planId) {
      console.error('[Stripe webhook] Missing metadata (whatsapp_number or plan)');
      return res.status(400).send('Missing required metadata');
    }

    const db = admin.firestore();
    const ref = db.collection('profiles').doc(whatsappNumber);

    const isAnnual = planId.endsWith('_year');
    const plan = planId.includes('pro') ? 'pro' : 'lite';

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(now.getDate() + (isAnnual ? 365 : 30));

    try {
      await ref.set(
        {
          plan,
          planExpires: expiresAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Updated ${whatsappNumber} → Plan: ${plan}, Expires: ${expiresAt.toISOString()}`);
    } catch (err) {
      console.error('[Stripe webhook] Firestore update failed:', err.message);
    }
  }

  res.status(200).send('ok');
});

module.exports = router;