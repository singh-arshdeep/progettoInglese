// In-memory store with the small part of the Netlify Blobs API the game uses (get, setJSON, list).
// shortcut: games live in memory, so they are lost when the server restarts or Render puts it to sleep;
// fine for a lesson, use a database if games must survive restarts.
const stores = new Map();

export function getStore({ name }) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  return {
    async get(key, opts) {
      if (!m.has(key)) return null;
      const v = m.get(key);
      return opts && opts.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) { m.set(key, JSON.stringify(value)); },
    async list({ prefix = "" } = {}) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

// drop games older than a day so memory does not grow forever
setInterval(() => {
  const s = stores.get("review-lab-games");
  if (!s) return;
  const old = Date.now() - 24 * 3600 * 1000;
  for (const [k, v] of s) {
    if (!k.endsWith("/state")) continue;
    if ((JSON.parse(v).created || 0) < old) {
      const pin = k.split("/")[0];
      for (const key of [...s.keys()]) if (key.startsWith(pin + "/")) s.delete(key);
    }
  }
}, 3600 * 1000).unref();
