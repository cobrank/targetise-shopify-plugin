const sessions = new Map();

const sessionStorage = {
  async storeSession(session) {
    sessions.set(session.id, session);
    return true;
  },

  async loadSession(id) {
    return sessions.get(id) || undefined;
  },

  async deleteSession(id) {
    return sessions.delete(id);
  },

  async deleteSessions(ids) {
    for (const id of ids) sessions.delete(id);
    return true;
  },

  async findSessionsByShop(shop) {
    return Array.from(sessions.values()).filter((s) => s.shop === shop);
  },
};

module.exports = { sessionStorage };
