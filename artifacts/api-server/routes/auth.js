const { Router } = require("express");
const { shopify } = require("../lib/shopify");
const { sessionStorage } = require("../lib/sessionStore");
const { registerPublisher } = require("./targetise");

const router = Router();

router.get("/shopify/install", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ error: "Missing shop parameter" });
  }

  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true),
      callbackPath: "/api/shopify/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (err) {
    console.error("[auth] OAuth begin failed:", err);
    res.status(500).json({ error: "OAuth initialisation failed" });
  }
});

router.get("/shopify/callback", async (req, res) => {
  try {
    const { session } = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    await sessionStorage.storeSession(session);
    console.log(`[auth] OAuth complete for ${session.shop}`);

    await registerPublisher(session.shop, session.accessToken);

    const appUrl = process.env.SHOPIFY_APP_URL || "";
    res.redirect(`${appUrl}/api/shopify/installed?shop=${session.shop}`);
  } catch (err) {
    console.error("[auth] OAuth callback failed:", err);
    res.status(500).json({ error: "OAuth callback failed" });
  }
});

router.get("/shopify/installed", (req, res) => {
  res.json({
    success: true,
    message: "Targetise app installed successfully",
    shop: req.query.shop || null,
  });
});

module.exports = router;
