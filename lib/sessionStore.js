// In-memory session store keyed by shop domain.
// Replace with a database-backed store for multi-instance deployments.
const sessions = new Map();

const sessionStorage = {
  save(shop, accessToken) {
    sessions.set(shop, { shop, accessToken, installedAt: new Date().toISOString() });
  },

  get(shop) {
    return sessions.get(shop) || null;
  },

  remove(shop) {
    return sessions.delete(shop);
  },
};

module.exports = { sessionStorage };
