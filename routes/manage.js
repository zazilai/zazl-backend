const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// GET /gerenciar?wa=+15551234567
router.get('/gerenciar', async (req, res) => {
  const raw = req.query.wa || '';
  const clean = raw.replace(/\D/g, '');
  if (!clean) return res.status(400).send('Número inválido.');

  const profileId = `whatsapp:+${clean}`;
  const db = admin.firestore();
  const snap = await db.collection('profiles').doc(profileId).get();
  if (!snap.exists) return res.status(404).send('Usuário não encontrado.');

  const data = snap.data();
  const customerId = data.customerId;
  if (!customerId) return res.status(404).send('Nenhum plano ativo vinculado a este número.');

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://zazil.ai',
    });
    return res.redirect(session.url);
  } catch (err) {
    console.error('[Stripe cancel portal] error:', err.message);
    return res.status(500).send('Erro interno. Tente novamente.');
  }
});

module.exports = router;