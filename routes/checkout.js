// routes/checkout.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  lite_month: 'price_1RQZgMFdcDuC9qbDomkTCPnp', // Replace with your Stripe Price IDs
  lite_year: 'price_1RQZgrFdcDuC9qbD3xZIuMEF',
  pro_month: 'price_1RQZhgFdcDuC9qbDI3KcYGRt',
  pro_year: 'price_1RQZiZFdcDuC9qbDRhDt8dsm'
};

router.post('/api/checkout', async (req, res) => {
  const { whatsappNumber, plan } = req.body;

  if (!whatsappNumber || !plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: PRICES[plan],
          quantity: 1
        }
      ],
      success_url: 'https://worldofbrazil.ai/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://worldofbrazil.ai/cancel',
      metadata: {
        whatsapp_number: whatsappNumber,
        plan
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe Checkout Error]', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;