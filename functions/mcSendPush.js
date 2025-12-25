const admin = require("firebase-admin");

let app;
if (!admin.apps.length) {
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
} else {
  app = admin.app();
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { token, title, body: messageBody, data } = body;

    if (!token || !title || !messageBody) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Missing token, title or body",
        }),
      };
    }

    const message = {
      token,
      notification: {
        title,
        body: messageBody,
      },
      data: data || {},
    };

    const response = await admin.messaging().send(message);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        messageId: response,
      }),
    };
  } catch (err) {
    console.error("mcsendpush error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message,
      }),
    };
  }
};
