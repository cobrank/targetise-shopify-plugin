const crypto = require("crypto");

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const APP_URL = process.env.SHOPIFY_APP_URL;
const SCOPES = "read_themes,write_themes";

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !APP_URL) {
  throw new Error(
    "Missing required env vars: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL"
  );
}

function buildInstallUrl(shop, state) {
  const redirectUri = `${APP_URL}/api/shopify/callback`;
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "per-user",
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

async function exchangeCodeForToken(shop, code) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed for ${shop}: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  const expected = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

function sanitizeShop(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

module.exports = {
  buildInstallUrl,
  exchangeCodeForToken,
  generateState,
  verifyHmac,
  sanitizeShop,
  APP_URL,
};
