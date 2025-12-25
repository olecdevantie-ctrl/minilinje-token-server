// netlify/functions/mcSendPush.js
const admin = require("firebase-admin");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

function normalizePrivateKey(pk) {
  // Netlify env vars often store newlines as "\n"
  return (pk || "").replace(/\\n/g, "\n");
}

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

// Init Firebase Admin once (Netlify may reuse the same lambda container)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: mustEnv("FIREBASE_PROJECT_ID"),
      clientEmail: mustEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: normalizePrivateKey(mustEnv("FIREBASE_PRIVATE_KEY")),
    }),
  });
}

exports.handler = async (event) => {
  try {
    // Optional: fingerprint mode to prove which code is running
    // Set env var MC_DEBUG_FINGERPRINT=1 in Netlify to enable
    if (process.env.MC_DEBUG_FINGERPRINT === "1") {
      return json(
        200,
        {
          ok: true,
          fingerprint: "mcsendpush-v1-x-token-firebase-admin",
          method: event.httpMethod,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, x-token",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return json(
        405,
        { ok: false, error: "Method not allowed" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    // Simple shared-secret auth via x-token header
    const headerToken =
      event.headers["x-token"] ||
      event.headers["X-Token"] ||
      event.headers["x-Token"];

    const expected = process.env.MC_SENDPUSH_TOKEN;
    if (!expected) {
      return json(
        500,
        {
          ok: false,
          error: "Server misconfigured: Missing MC_SENDPUSH_TOKEN env var",
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    if (!headerToken || headerToken !== expected) {
      return json(
        401,
        { ok: false, error: "Missing or invalid token" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return json(
        400,
        { ok: false, error: "Invalid JSON body" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    // Accept both formats:
    // - { token, title, body, data }
    // - { to, type, title, body, data }
    const deviceToken = body.token || body.to;
    const type = body.type || (body.data && body.data.type);

    const title = body.title;
    const messageBody = body.body || body.messageBody;

    // Merge data payload (all values must be strings for FCM data)
    const data = Object.assign({}, body.data || {});
    if (type && !data.type) data.type = type;

    if (!deviceToken) {
      return json(
        400,
        { ok: false, error: "Missing token/to" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const message = {
      token: deviceToken,
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [String(k), String(v)])
      ),
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    };

    // Attach notification only if provided (data-only is best for call overlay)
    if (title && messageBody) {
      message.notification = {
        title: String(title),
        body: String(messageBody),
      };
    }

    const messageId = await admin.messaging().send(message);

    return json(
      200,
      { ok: true, messageId },
      { "Access-Control-Allow-Origin": "*" }
    );
  } catch (err) {
    console.error("mcSendPush error:", err);
    return json(
      500,
      { ok: false, error: err.message || String(err) },
      { "Access-Control-Allow-Origin": "*" }
    );
  }
};
