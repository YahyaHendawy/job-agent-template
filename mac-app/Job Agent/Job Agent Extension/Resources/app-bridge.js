// Runs only on the Job Agent app itself. Lets Settings → "Connect this Mac" hand a token to the extension
// without any copy/paste. Accepts messages only from the page's own origin.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const announce = () => window.postMessage({ type: "JOB_AGENT_EXTENSION_PRESENT" }, location.origin);
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data) return;
    if (e.data.type === "JOB_AGENT_PING") announce();
    if (e.data.type === "JOB_AGENT_TOKEN" && typeof e.data.token === "string" && e.data.token.startsWith("ja_")) {
      const r = await api.runtime.sendMessage({ type: "saveToken", token: e.data.token, base: location.origin });
      window.postMessage({ type: r && r.ok ? "JOB_AGENT_CONNECTED" : "JOB_AGENT_CONNECT_FAILED" }, location.origin);
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announce); else announce();
})();
