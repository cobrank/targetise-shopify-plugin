const { Router } = require("express");
const crypto = require("crypto");
const { sessionStorage } = require("../lib/sessionStore");

const router = Router();

function verifyShopifyWebhook(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return false;

  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !req.rawBody) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/webhooks/shopify/app-uninstalled", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    console.warn("[webhooks] Invalid Shopify webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const shop = req.headers["x-shopify-shop-domain"];
  console.log(`[webhooks] App uninstalled from ${shop}`);

  if (shop) {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    const ids = sessions.map((s) => s.id);
    if (ids.length) await sessionStorage.deleteSessions(ids);
    console.log(`[webhooks] Cleared ${ids.length} session(s) for ${shop}`);
  }

  res.status(200).send();
});

module.exports = router;
