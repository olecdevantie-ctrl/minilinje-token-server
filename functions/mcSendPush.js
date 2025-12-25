// mcSendPush.js (robust, no .then usage)

const admin = require("firebase-admin");

function readToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  return String(
    h["x-token"] ||
      h["X-Token"] ||
      h["x-api-key"] ||
      h["X-Api-Key"] ||
      ""
  ).trim();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-token, x-api-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function ensureFirebase() {
  if (admin.apps && admin.apps.length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID env var.");
  if (!clientEmail) throw new Error("Missing FIREBASE_CLIENT_EMAIL env var.");
  if (!privateKeyRaw) throw new Error("Missing FIREBASE_PRIVATE_KEY env var.");

  // Works whether you stored multiline key OR \n text
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

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
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(), body: "" };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: false, error: "Use POST" }),
      };
    }

    // Auth
    const expected = process.env.MC_SENDPUSH_TOKEN;
    if (!expected) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({
          ok: false,
          error: "Missing MC_SENDPUSH_TOKEN env var.",
        }),
      };
    }

    const got = readToken(event);
    if (!got) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: false, error: "Missing token" }),
      };
    }
    if (got !== expected) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: false, error: "Invalid token" }),
      };
    }

    // Body
    const body = JSON.parse(event.body || "{}");
    const type = body.type;
    const to = body.to || body.deviceToken;
    const data = body.data || {};

    if (!type) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: false, error: "Missing type" }),
      };
    }
    if (!to) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: false, error: "Missing to" }),
      };
    }

    // Firebase init
    ensureFirebase();

    if (!admin.messaging || typeof admin.messaging !== "function") {
      throw new Error("Firebase Admin messaging() is not available.");
    }

    // Send DATA push (best for call overlay flows)
    const message = {
      token: String(to),
      data: {
        type: String(type),
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [String(k), String(v)])
        ),
      },
    };

    const messageId = await admin.messaging().send(message);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true, messageId }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
