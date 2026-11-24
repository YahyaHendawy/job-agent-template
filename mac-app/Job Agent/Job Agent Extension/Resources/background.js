// Job Agent Autofill: background. Holds the connection token and talks to the Job Agent API.
const api = globalThis.browser ?? globalThis.chrome;

async function cfg() {
  const s = await api.storage.local.get(["token", "base"]);
  return { token: s.token, base: s.base || "https://YOUR-APP.vercel.app" };
}

async function call(path, init = {}) {
  const { token, base } = await cfg();
  if (!token) return { error: "Not connected yet. Open Job Agent → Settings → Connect this Mac." };
  const r = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { error: body.error || `Job Agent error ${r.status}` };
  return body;
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "getKit") {
      const q = new URLSearchParams({ url: msg.url });
      if (msg.applicationId) q.set("applicationId", msg.applicationId);
      return call(`/api/autofill/kit?${q}`);
    }
    if (msg.type === "submitted") return call("/api/autofill/submitted", { method: "POST", body: JSON.stringify(msg.payload) });
    if (msg.type === "formQuestions") return call("/api/autofill/questions", { method: "POST", body: JSON.stringify(msg.payload) });
    if (msg.type === "saveToken") { await api.storage.local.set({ token: msg.token, base: msg.base }); return { ok: true }; }
    if (msg.type === "status") { const c = await cfg(); return { connected: !!c.token, base: c.base }; }
    if (msg.type === "disconnect") { await api.storage.local.remove(["token"]); return { ok: true }; }
    return { error: "unknown message" };
  })().then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true; // async response
});
