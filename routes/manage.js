// routes/manage.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Customer portal redirect
router.get('/manage', async (req, res) => {
  const wa = req.query.wa;
  if (!wa) return res.status(400).send('Missing ?wa parameter');

  try {
    // Find customer by metadata
    const customers = await stripe.customers.list({ limit: 100 });
    const customer = customers.data.find(c => c.metadata?.whatsapp_number === wa);

    if (!customer) return res.status(404).send('Customer not found');

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: 'https://worldofbrazil.ai'
    });

    return res.redirect(session.url);
  } catch (err) {
    console.error('[manage.js] Failed to create portal session:', err.message);
    return res.status(500).send('Internal error');
  }
});

module.exports = router;