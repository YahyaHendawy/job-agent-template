"use client";
import { useEffect, useState } from "react";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushControls({ vapidKey, serverReady }: { vapidKey: string | null; serverReady: boolean }) {
  const [state, setState] = useState<"checking" | "unsupported" | "needs-install" | "off" | "on" | "denied">("checking");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(ios && !standalone ? "needs-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission(); // must run from a tap (iOS requirement)
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey!) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error(await res.text());
      setState("on");
      setMsg("This device is subscribed.");
    } catch (e: any) { setMsg(`Could not enable: ${e.message}`); }
  }

  async function test() {
    setMsg("Sending…");
    const r = await fetch("/api/push/test", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Test sent to ${j.sent} device(s)${j.skipped ? ` (${j.skipped})` : ""}. It should arrive within seconds.` : `Failed: ${j.error ?? r.status}`);
  }

  if (!serverReady || !vapidKey) return <p className="text-sm" style={{ color: "var(--warn)" }}>Push delivery is not configured on the server yet.</p>;
  return (
    <div className="text-sm">
      {state === "needs-install" && <p>On iPhone/iPad, notifications only work from the installed app: tap <b>Share → Add to Home Screen</b>, open Job Agent from your Home Screen, then return here.</p>}
      {state === "unsupported" && <p className="text-muted">This browser does not support push notifications.</p>}
      {state === "denied" && <p style={{ color: "var(--bad)" }}>Notifications are blocked for this app. Re-enable them in your device settings (iPhone: Settings → Notifications → Job Agent).</p>}
      {state === "off" && <button className="btn btn-primary" onClick={enable}>Enable notifications on this device</button>}
      {state === "on" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="chip" style={{ color: "var(--good)" }}>Notifications on for this device</span>
          <button className="btn btn-ghost !text-sm" onClick={test}>Send test notification</button>
          <button className="btn btn-ghost !text-sm" onClick={enable}>Re-register</button>
        </div>
      )}
      {msg && <p className="text-muted mt-2">{msg}</p>}
    </div>
  );
}
