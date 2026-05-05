const { Router } = require("express");
const {
  buildInstallUrl,
  exchangeCodeForToken,
  generateState,
  verifyHmac,
  sanitizeShop,
  APP_URL,
} = require("../lib/shopify");
const { sessionStorage } = require("../lib/sessionStore");
const { registerPublisher } = require("./targetise");

const router = Router();

// Pending OAuth states (nonce → shop)
const pendingStates = new Map();

// Step 1 — redirect merchant to Shopify OAuth consent screen
router.get("/shopify/install", (req, res) => {
  const shop = sanitizeShop(req.query.shop);
  if (!shop) {
    return res.status(400).json({ error: "Missing or invalid shop parameter" });
  }

  const state = generateState();
  pendingStates.set(state, shop);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000); // expire after 10 min

  const url = buildInstallUrl(shop, state);
  console.log(`[auth] Starting OAuth for ${shop}`);
  res.redirect(url);
});

// Step 2 — Shopify redirects back here with the auth code
router.get("/shopify/callback", async (req, res) => {
  const { shop: rawShop, code, state, hmac } = req.query;

  const shop = sanitizeShop(rawShop);
  if (!shop) return res.status(400).json({ error: "Invalid shop" });

  // Verify nonce
  if (!pendingStates.has(state)) {
    return res.status(403).json({ error: "Invalid or expired state" });
  }
  pendingStates.delete(state);

  // Verify Shopify HMAC signature
  if (!verifyHmac(req.query)) {
    return res.status(403).json({ error: "HMAC verification failed" });
  }

  try {
    const accessToken = await exchangeCodeForToken(shop, code);
    sessionStorage.save(shop, accessToken);
    console.log(`[auth] OAuth complete for ${shop}`);

    await registerPublisher(shop, accessToken);

    res.redirect(`${APP_URL}/api/shopify/installed?shop=${shop}`);
  } catch (err) {
    console.error("[auth] Callback error:", err.message);
    res.status(500).json({ error: "OAuth callback failed" });
  }
});

// Landing page shown after successful install
router.get("/shopify/installed", (req, res) => {
  res.json({
    success: true,
    message: "Targetise app installed successfully",
    shop: req.query.shop || null,
  });
});

module.exports = router;
