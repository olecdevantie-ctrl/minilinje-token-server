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

// Init Firebase Admin once
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
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, error: "Method not allowed" }),
      };
    }

    // Simple shared-secret auth
    const headerToken =
      event.headers["x-token"] ||
      event.headers["X-Token"] ||
      event.headers["x-Token"];

    const expected = process.env.MC_SENDPUSH_TOKEN;
    if (!expected) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "Server misconfigured: Missing MC_SENDPUSH_TOKEN env var",
        }),
      };
    }

    if (!headerToken || headerToken !== expected) {
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: "Missing or invalid token" }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    // Accept both formats:
    // - { token, title, body, data }
    // - { to, type, title, body, data }
    const deviceToken = body.token || body.to;
    const type = body.type || (body.data && body.data.type);

    // body.body is common, but messageBody also supported
    const title = body.title;
    const messageBody = body.body || body.messageBody;

    // Merge data payload
    const data = Object.assign({}, body.data || {});
    if (type && !data.type) data.type = type;

    if (!deviceToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing token/to" }),
      };
    }

    // If title/body is missing -> send data-only (best for call overlay)
    const message = {
      token: deviceToken,
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [String(k), String(v)])
      ),
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
      },
    };

    // Only attach notification if provided
    if (title && messageBody) {
      message.notification = { title: String(title), body: String(messageBody) };
    }

    const response = await admin.messaging().send(message);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, messageId: response }),
    };
  } catch (err) {
    console.error("mcsendpush error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
