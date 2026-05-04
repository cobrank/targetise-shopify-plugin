const { Router } = require("express");
const crypto = require("crypto");
const { sessionStorage } = require("../lib/sessionStore");
const { injectVoucher, removeVoucher } = require("../lib/emailTemplate");

const router = Router();
const TARGETISE_API_URL = process.env.TARGETISE_API_URL || "https://targetise.com/api";

async function registerPublisher(shop, accessToken) {
  const shopRes = await fetch(`https://${shop}/admin/api/2025-01/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!shopRes.ok) {
    throw new Error(`Failed to fetch shop info for ${shop}: ${shopRes.status}`);
  }

  const { shop: shopData } = await shopRes.json();

  const registerRes = await fetch(`${TARGETISE_API_URL}/publishers/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shop,
      name: shopData.name,
      email: shopData.email,
      address: shopData.address1,
    }),
  });

  if (!registerRes.ok) {
    throw new Error(`Targetise registration failed for ${shop}: ${registerRes.status}`);
  }

  console.log(`[targetise] Registered publisher: ${shop}`);
}

function verifySignature(req) {
  const secret = process.env.TARGETISE_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.headers["x-targetise-signature"];
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/webhooks/targetise", async (req, res) => {
  if (!verifySignature(req)) {
    console.warn("[targetise] Invalid webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, shop, voucher_code, campaign_name } = req.body;
  console.log(`[targetise] Received event "${event}" for ${shop}`);

  const sessions = await sessionStorage.findSessionsByShop(shop);
  const session = sessions[0];

  if (!session?.accessToken) {
    console.error(`[targetise] No session found for ${shop}`);
    return res.status(404).json({ error: "Shop not installed" });
  }

  if (event === "campaign.accepted") {
    if (!voucher_code || !campaign_name) {
      return res.status(400).json({ error: "Missing voucher_code or campaign_name" });
    }
    await injectVoucher(shop, session.accessToken, voucher_code, campaign_name);
    return res.json({ success: true, action: "voucher_injected" });
  }

  if (event === "campaign.ended" || event === "campaign.cancelled") {
    await removeVoucher(shop, session.accessToken);
    return res.json({ success: true, action: "voucher_removed" });
  }

  console.warn(`[targetise] Unhandled event: ${event}`);
  res.status(400).json({ error: `Unhandled event: ${event}` });
});

module.exports = router;
module.exports.registerPublisher = registerPublisher;
