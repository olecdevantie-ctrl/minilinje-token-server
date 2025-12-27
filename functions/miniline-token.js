const { AccessToken } = require("livekit-server-sdk");

function buildCorsHeaders(requestOrigin) {
  // Hvis du vil låse den til ét domæne:
  // Sæt env: ALLOWED_ORIGIN=https://native-bridge-private.netlify.app
  const allowed = process.env.ALLOWED_ORIGIN || "*";

  // Hvis allowed er "*" så svar med "*".
  // Hvis allowed er en specifik origin, så brug den.
  // (Du kan også vælge at spejle requestOrigin, men vi holder den enkel og stabil.)
  const allowOrigin = allowed === "*" ? "*" : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

exports.handler = async (event) => {
  const requestOrigin =
    (event.headers && (event.headers.origin || event.headers.Origin)) || "";

  const headers = buildCorsHeaders(requestOrigin);

  // Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: "Use POST" }),
    };
  }

  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
  const LIVEKIT_URL = process.env.LIVEKIT_URL;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error:
          "Missing env vars: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL",
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "Bad JSON" }),
    };
  }

  const room = body.room;
  const identity = body.identity;
  const name = body.name || identity || "user";

  if (!room || !identity) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "Missing fields: room, identity",
      }),
    };
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // ✅ VIGTIGT: demoen forventer { url, token }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        url: LIVEKIT_URL,
        token,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "Token error",
        details: String((e && e.message) || e),
      }),
    };
  }
};
