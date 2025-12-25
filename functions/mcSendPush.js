// netlify/functions/mcSendPush.js
const admin = require("firebase-admin");

function readToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    h["x-token"] ||
    h["X-Token"] ||
    h["x-api-key"] ||
    h["X-Api-Key"] ||
    ""
  ).trim();
}

function json(res) {
  return JSON.stringify(res);
}

function ensureFirebase() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID env var.");
  if (!clientEmail) throw new Error("Missing FIREBASE_CLIENT_EMAIL env var.");
  if (!privateKeyRaw) throw new Error("Missing FIREBASE_PRIVATE_KEY env var.");

  // Netlify env vars often store \n literally
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

exports.handler = async (event) => {
  try {
    // CORS
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-token, x-api-key",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: json({ ok: false, error: "Use POST" }) };
    }

    // Auth token for this endpoint
    const expected = process.env.MC_SENDPUSH_TOKEN;
    if (!expected) {
      return { statusCode: 500, body: json({ ok: false, error: "Missing MC_SENDPUSH_TOKEN env var." }) };
    }
    const got = readToken(event);
    if (!got) return { statusCode: 400, body: json({ ok: false, error: "Missing token" }) };
    if (got !== expected) return { statusCode: 401, body: json({ ok: false, error: "Invalid token" }) };

    const body = JSON.parse(event.body || "{}");

    const type = body.type;
    const to = body.to || body.deviceToken;
    const data = body.data || {};

    if (!type) return { statusCode: 400, body: json({ ok: false, error: "Missing type" }) };
    if (!to) return { statusCode: 400, body: json({ ok: false, error: "Missing to" }) };

    ensureFirebase();

    // Send as data message (best for call flows)
    const message = {
      token: to,
      data: {
        type: String(type),
        ...(Object.fromEntries(
          Object.entries(data).map(([k, v]) => [String(k), String(v)])
        )),
      },
    };

    const msgId = await admin.messaging().send(message);

    return { statusCode: 200, body: json({ ok: true, messageId: msgId }) };
  } catch (e) {
    return { statusCode: 500, body: json({ ok: false, error: e.message || String(e) }) };
  }
};
