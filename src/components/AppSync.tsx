"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Keeps every screen live: polls for changes every 4 s while visible, refreshes the moment the app
 * comes back to the foreground, keeps the Home Screen badge in sync, and silently repairs the push
 * subscription (iOS can rotate or drop it) whenever notification permission is already granted.
 */
export function AppSync({ vapidKey }: { vapidKey: string | null }) {
  const router = useRouter();
  const last = useRef<{ latest: number; approvals: number; stateAt: string } | null>(null);

  useEffect(() => {
    let stopped = false, busy = false, lastRefresh = 0;
    const check = async (force = false) => {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch("/api/sync", { cache: "no-store" });
        if (r.status === 401) { location.href = "/login"; return; }
        if (!r.ok) return;
        const s = await r.json();
        const prev = last.current;
        last.current = s;
        const nav = navigator as any;
        if ("setAppBadge" in nav) (s.approvals > 0 ? nav.setAppBadge(s.approvals) : nav.clearAppBadge?.())?.catch?.(() => {});
        const changed = prev && (prev.latest !== s.latest || prev.approvals !== s.approvals || prev.stateAt !== s.stateAt);
        if ((changed || force) && Date.now() - lastRefresh > 2500) { lastRefresh = Date.now(); router.refresh(); }
      } catch { /* offline: try again next tick */ } finally { busy = false; }
    };
    check();
    const t = setInterval(() => check(), 4000);
    const onVis = () => { if (document.visibilityState === "visible") check(true); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("online", onVis);
    return () => {
      stopped = true; clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("online", onVis);
    };
  }, [router]);

  // Push self-healing (at most every 6 hours per device)
  useEffect(() => {
    (async () => {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      let lastSync = 0;
      try { lastSync = Number(localStorage.getItem("pushSyncAt") ?? 0); } catch {}
      if (Date.now() - lastSync < 6 * 3600_000) return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const keyMatches = sub?.options?.applicationServerKey
        ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") === vapidKey
        : true;
      if (sub && !keyMatches) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (r.ok) try { localStorage.setItem("pushSyncAt", String(Date.now())); } catch {}
    })().catch(() => {});
  }, [vapidKey]);

  return null;
}
