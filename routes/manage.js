// routes/manage.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const portalUrl = 'https://billing.stripe.com/p/login'; // fallback if no session

router.get('/manage', async (req, res) => {
  const whatsapp = req.query.wa?.replace(/[^\d+]/g, '');
  if (!whatsapp) return res.status(400).send('Missing WhatsApp number');

  try {
    // Look up customer by phone number metadata
    const customers = await stripe.customers.search({
      query: `metadata[\"whatsapp_number\"]:\"${whatsapp}\"`,
    });

    const customer = customers.data?.[0];
    if (!customer) return res.redirect(portalUrl);

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: 'https://worldofbrazil.ai',
    });

    res.redirect(session.url);
  } catch (err) {
    console.error('[Manage portal] Error:', err.message);
    res.redirect(portalUrl);
  }
});

module.exports = router;