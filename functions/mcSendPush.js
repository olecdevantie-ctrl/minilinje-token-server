// /functions/mcSendPush.js
const admin = require("firebase-admin");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

function normalizePrivateKey(pk) {
  return (pk || "").replace(/\\n/g, "\n");
}

function withCors(res) {
  return {
    ...res,
    headers: {
      ...(res.headers || {}),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-token",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  };
}

function json(statusCode, obj) {
  return withCors({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
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
      return withCors({ statusCode: 204, body: "" });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    // Auth: shared secret in x-token header
    const headerToken =
      event.headers["x-token"] ||
      event.headers["X-Token"] ||
      event.headers["x-Token"];

    const expected = process.env.MC_SENDPUSH_TOKEN;
    if (!expected) {
      return json(500, {
        ok: false,
        error: "Server misconfigured: Missing MC_SENDPUSH_TOKEN env var",
      });
    }

    if (!headerToken || headerToken !== expected) {
      return json(401, { ok: false, error: "Missing or invalid token" });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const deviceToken = body.token || body.to;
    const type = body.type || (body.data && body.data.type);

    const title = body.title;
    const messageBody = body.body || body.messageBody;

    const data = Object.assign({}, body.data || {});
    if (type && !data.type) data.type = type;

    if (!deviceToken) {
      return json(400, { ok: false, error: "Missing token/to" });
    }

    const message = {
      token: deviceToken,
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [String(k), String(v)])
      ),
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    };

    // Attach notification only if provided (data-only best for call overlay)
    if (title && messageBody) {
      message.notification = {
        title: String(title),
        body: String(messageBody),
      };
    }

    const messageId = await admin.messaging().send(message);
    return json(200, { ok: true, messageId });
  } catch (err) {
    console.error("mcSendPush error:", err);
    return json(500, { ok: false, error: err.message || String(err) });
  }
};
