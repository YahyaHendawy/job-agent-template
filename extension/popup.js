const api = globalThis.browser ?? globalThis.chrome;
(async () => {
  const s = await api.runtime.sendMessage({ type: "status" });
  const st = document.getElementById("st");
  document.getElementById("open").href = (s && s.base) || "https://YOUR-APP.vercel.app";
  if (s && s.connected) {
    st.textContent = "✓ Connected to your Job Agent";
    st.className = "ok";
    const d = document.getElementById("dis");
    d.hidden = false;
    d.onclick = async () => { await api.runtime.sendMessage({ type: "disconnect" }); location.reload(); };
  } else {
    st.textContent = "Not connected. Open Job Agent → Settings → Connect this Mac.";
    st.className = "w";
    document.getElementById("open").href = ((s && s.base) || "https://YOUR-APP.vercel.app") + "/settings/autofill";
  }
})();
