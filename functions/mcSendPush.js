// functions/mcSendPush.js
// Sender FCM push til Android via firebase-admin
// Forventer POST JSON:
// {
//   "token": "FCM_DEVICE_TOKEN",
//   "type": "miniline_call_waiting" | "message" | "join_request" | "...",
//   "conversationId": "optional",
//   "callId": "optional",
//   "title": "optional",
//   "body": "optional"
// }

const admin = require("firebase-admin");

function json(resCode, obj) {
  return {
    statusCode: resCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function getServiceAccountFromEnv() {
  // Du skal lægge hele service account JSON ind i Netlify env:
  // FIREBASE_SERVICE_ACCOUNT = { ... }  (string)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    // Nogle copy/paste giver \n i private_key som \\n
    const parsed = JSON.parse(raw);
    if (parsed.private_key && typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function initFirebaseAdminIfNeeded() {
  if (admin.apps && admin.apps.length) return;

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT env var (service account JSON as string)"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(sa),
  });
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return json(204, { ok: true });
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  const token = (payload.token || "").trim();
  const type = (payload.type || "").trim();

  if (!token) return json(400, { error: "Missing token" });
  if (!type) return json(400, { error: "Missing type" });

  const conversationId = (payload.conversationId || "").toString();
  const callId = (payload.callId || "").toString();

  const title =
    (payload.title || "").toString().trim() || "MinCirkel";
  const body =
    (payload.body || "").toString().trim() ||
    (type.includes("call") ? "Indgående opkald" : "Ny besked");

  // ✅ De her keys matcher din Android MainActivity.handleIntent():
  // intent extras:
  //  mc_push_type
  //  mc_push_conversationId
  //  mc_push_callId
  const data = {
    mc_push_type: type,
    mc_push_conversationId: conversationId,
    mc_push_callId: callId,
  };

  try {
    initFirebaseAdminIfNeeded();

    const message = {
      token,
      data,

      // Notifikation hjælper når app er i baggrunden/lukket
      notification: {
        title,
        body,
      },

      android: {
        priority: "high",
      },
    };

    const messageId = await admin.messaging().send(message);

    return json(200, {
      ok: true,
      messageId,
      sent: { type, conversationId, callId },
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};
