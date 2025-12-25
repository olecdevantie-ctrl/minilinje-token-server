// /functions/mcSendPush.js
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      fingerprint: "MCSP_2025-12-25_OLLE_DEBUG",
    }),
  };
};
