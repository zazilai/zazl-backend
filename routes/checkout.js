// routes/checkout.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Replace with your actual Price IDs from Stripe
const PRICE_IDS = {
  lite_month: 'price_1RQZgMFdcDuC9qbDomkTCPnp',
  lite_year: 'price_1RQZgrFdcDuC9qbD3xZIuMEF',
  pro_month: 'price_1RQZhgFdcDuC9qbDI3KcYGRt',
  pro_year: 'price_1RQZiZFdcDuC9qbDRhDt8dsm'
};

router.get('/checkout/:plan/:period', async (req, res) => {
  const { plan, period } = req.params;
  const wa = req.query.whatsapp || req.query.wa || '';

  if (!wa || !['lite', 'pro'].includes(plan) || !['month', 'year'].includes(period)) {
    return res.status(400).send('❌ Invalid request. Missing WhatsApp number or incorrect plan/period.');
  }

  const priceId = PRICE_IDS[`${plan}_${period}`];
  if (!priceId) {
    return res.status(400).send('❌ Invalid plan or period');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        whatsapp_number: wa,
        plan: `${plan}_${period}`
      },
      success_url: 'https://worldofbrazil.ai/sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://worldofbrazil.ai/cancelamento'
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    res.status(500).send('❌ Failed to create checkout session.');
  }
});

module.exports = router;