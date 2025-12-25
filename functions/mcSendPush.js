// functions/mcSendPush.js
const admin = require("firebase-admin");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function json(statusCode, headers, obj) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(obj)
  };
}

function getServiceAccountFromEnv() {
  // Du skal sætte denne på Netlify:
  // FIREBASE_SERVICE_ACCOUNT_JSON = (hele JSON'en fra Firebase service account key)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    // Netlify env kan indeholde JSON direkte (med { } osv.)
    return JSON.parse(raw);
  } catch (e) {
    // Hvis du har gemt den som en string med escaped \n, prøv at normalisere
    try {
      const normalized = raw.replace(/\\n/g, "\n");
      return JSON.parse(normalized);
    } catch (e2) {
      return null;
    }
  }
}

function ensureFirebaseAdmin() {
  if (admin.apps.length) return;

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON env var (Firebase service account key JSON)."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(sa)
  });
}

exports.handler = async (event) => {
  const headers = corsHeaders(process.env.ALLOWED_ORIGIN || "*");

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, headers, { error: "Use POST" });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return json(400, headers, { error: "Invalid JSON body" });
  }

  const token = (body.token || "").trim();
  const type = (body.type || "").trim();

  // notification kan være valgfri, men vi støtter title/body for test
  const title = (body.title || "MinCirkel").toString();
  const msgBody = (body.body || "").toString();

  const conversationId = (body.conversationId || "").toString();
  const callId = (body.callId || "").toString();

  if (!token) return json(400, headers, { error: "Missing token" });
  if (!type) return json(400, headers, { error: "Missing type" });

  try {
    ensureFirebaseAdmin();

    // ✅ Matcher din Android MainActivity.handleIntent(...) der læser:
    // mc_push_type, mc_push_conversationId, mc_push_callId
    const message = {
      token,
      notification: {
        title,
        body: msgBody
      },
      data: {
        mc_push_type: type,
        mc_push_conversationId: conversationId,
        mc_push_callId: callId
      },
      android: {
        priority: "high"
      }
    };

    const messageId = await admin.messaging().send(message);

    return json(200, headers, {
      ok: true,
      messageId
    });
  } catch (err) {
    return json(500, headers, {
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
};
