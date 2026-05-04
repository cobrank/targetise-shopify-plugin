require("@shopify/shopify-api/adapters/node");
const { shopifyApi, ApiVersion, LogSeverity } = require("@shopify/shopify-api");

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const appUrl = process.env.SHOPIFY_APP_URL;

if (!apiKey || !apiSecret || !appUrl) {
  throw new Error(
    "Missing required env vars: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL"
  );
}

const shopify = shopifyApi({
  apiKey,
  apiSecretKey: apiSecret,
  scopes: ["read_themes", "write_themes"],
  hostName: appUrl.replace(/^https?:\/\//, ""),
  hostScheme: "https",
  apiVersion: ApiVersion.January25,
  isEmbeddedApp: false,
  logger: {
    level: LogSeverity.Warning,
    httpRequests: false,
    timestamps: false,
    log: async (severity, message) => {
      if (severity === LogSeverity.Error) console.error("[Shopify]", message);
      else if (severity === LogSeverity.Warning) console.warn("[Shopify]", message);
    },
  },
});

module.exports = { shopify };
