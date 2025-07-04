// routes/view.js — Future-proof for Zazil (2025, longReplies collection)
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.get('/view/:id', async (req, res) => {
  const id = req.params.id;
  const db = admin.firestore();

  try {
    // Now fetching from longReplies, field is 'answer'
    const snap = await db.collection('longReplies').doc(id).get();
    if (!snap.exists) {
      return res.status(404).send('<h2>❌ Resposta não encontrada.</h2>');
    }

    const data = snap.data();
    // Optionally show question above answer
    const question = (data?.question || '').replace(/\n/g, '<br>');
    const content = (data?.answer || '').replace(/\n/g, '<br>');

    res.send(`
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Zazil Resposta Completa</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, sans-serif;
              background: #f4f4f4;
              padding: 2rem;
              line-height: 1.6;
              color: #222;
              max-width: 700px;
              margin: auto;
            }
            .box {
              background: #fff;
              border-radius: 8px;
              padding: 2rem;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .question {
              color: #666;
              font-size: 1rem;
              margin-bottom: 1.5rem;
              border-left: 3px solid #19b371;
              padding-left: 1rem;
              background: #f9f9f9;
            }
            .footer {
              margin-top: 2rem;
              text-align: center;
            }
            .footer a {
              text-decoration: none;
              color: #1AAD19;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>🤖 Resposta completa do Zazil:</h2>
            ${question ? `<div class="question"><strong>Pergunta original:</strong><br>${question}</div>` : ''}
            <p>${content}</p>
          </div>
          <div class="footer">
            <p><a href="https://wa.me/message/6DF4PSIX6W4IB1">Voltar ao WhatsApp</a></p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[view.js] Erro ao buscar resposta:', err);
    res.status(500).send('<h2>Erro interno. Tente novamente mais tarde.</h2>');
  }
});

module.exports = router;