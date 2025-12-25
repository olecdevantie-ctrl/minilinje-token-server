// netlify/functions/mcSendPush.js
const admin = require("firebase-admin");

// Init Firebase Admin (én gang)
function initAdmin() {
  if (admin.apps.length) return;

  // Du skal sætte FIREBASE_SERVICE_ACCOUNT i Netlify (env var)
  // som JSON string (eller base64 - sig til hvis du vil have base64 version)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders(process.env.ALLOWED_ORIGIN || "*");

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
  }

  try {
    initAdmin();

    const body = JSON.parse(event.body || "{}");

    // ✅ Forventet input fra web:
    // { toUserId, type, conversationId, callId }
    const toUserId = String(body.toUserId || "");
    const type = String(body.type || "miniline_call");
    const conversationId = String(body.conversationId || "");
    const callId = String(body.callId || "");

    if (!toUserId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing toUserId" }) };
    }

    const db = admin.firestore();

    // Hent alle tokens
    const snap = await db.collection("users").doc(toUserId).collection("fcmTokens").get();
    const tokens = snap.docs
      .map((d) => (d.data() && d.data().token ? String(d.data().token) : ""))
      .filter(Boolean);

    if (!tokens.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: 0, reason: "no_tokens" }) };
    }

    // ✅ Data payload der matcher din Android handleIntent()
    const data = {
      mc_push_type: type,
      mc_push_conversationId: conversationId,
      mc_push_callId: callId,
    };

    // Send til alle tokens
    const results = [];
    for (const token of tokens) {
      try {
        const messageId = await admin.messaging().send({
          token,
          data,
          // optional: android priority
          android: { priority: "high" },
        });
        results.push({ token: token.slice(0, 12) + "...", ok: true, messageId });
      } catch (err) {
        const code = err?.errorInfo?.code || err?.code || "unknown";
        results.push({ token: token.slice(0, 12) + "...", ok: false, code });

        // Hvis token er død → slet doc (så du ikke spammer døde tokens)
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          const dead = snap.docs.find((d) => d.data()?.token === token);
          if (dead) await dead.ref.delete();
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: results.length, results }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
