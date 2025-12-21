const { AccessToken } = require("livekit-server-sdk");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  const headers = corsHeaders(allowedOrigin);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Use POST" })
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
        error: "Missing env vars: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL"
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Bad JSON" })
    };
  }

  const room = body.room;
  const identity = body.identity;
  const name = body.name || identity || "user";

  if (!room || !identity) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing fields: room, identity" })
    };
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true
    });

    const token = await at.toJwt();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        serverUrl: LIVEKIT_URL,
        token
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Token error", details: String(e?.message || e) })
    };
  }
};
