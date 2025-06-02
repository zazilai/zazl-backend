// routes/webhook.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // optional, for verifying products
const admin = require('firebase-admin');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = Stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const whatsappNumber = session.metadata?.whatsapp_number;
    const plan = session.display_items?.[0]?.custom?.name?.toLowerCase().includes('pro') ? 'pro' : 'lite';

    if (!whatsappNumber) {
      console.error('[Stripe webhook] Missing WhatsApp number');
      return res.status(400).send('Missing WhatsApp number');
    }

    const db = admin.firestore();
    const ref = db.collection('profiles').doc(whatsappNumber);

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await ref.set(
      {
        plan,
        planExpires: expiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Updated plan for ${whatsappNumber} → ${plan}`);
  }

  res.status(200).send('ok');
});

module.exports = router;