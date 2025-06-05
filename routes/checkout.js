// routes/checkout.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  lite_month: 'price_1RQZgMFdcDuC9qbDomkTCPnp',
  lite_year:  'price_1RQZgrFdcDuC9qbD3xZtUMEF',
  pro_month:  'price_1RQZhgFdcDuC9qbDI3KcYGRt',
  pro_year:   'price_1RQZiZFdcDuC9qbDRhDt8dsm'
};

// Access via: /checkout/lite/month?whatsapp=+15551234567
router.get('/checkout/:plan/:period', async (req, res) => {
  const { plan, period } = req.params;
  const whatsapp = req.query.whatsapp;

  if (!whatsapp) {
    return res.status(400).send('Missing WhatsApp number');
  }

  const priceId = PRICES[`${plan}_${period}`];
  if (!priceId) {
    return res.status(400).send('Invalid plan or period');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        whatsapp_number: whatsapp,
        plan: `${plan}_${period}`
      },
      success_url: 'https://worldofbrazil.ai',
      cancel_url: 'https://worldofbrazil.ai'
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error('🔥 Stripe Checkout Error:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;