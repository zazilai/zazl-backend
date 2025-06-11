// helpers/firebase.js

const admin = require('firebase-admin');

let app;
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  app = admin.app(); // Reuse existing app if already initialized
}

module.exports = { admin, app };