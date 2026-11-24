"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flushOutbox, readOutbox } from "@/lib/outbox";

/**
 * Makes the app usable without a connection: keeps your key screens saved on this device,
 * shows a clear strip when you're offline, and sends answers typed offline as soon as you're back.
 */
export function OfflineSync() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [justSynced, setJustSynced] = useState(0);

  useEffect(() => {
    const count = () => setWaiting(readOutbox().length);
    const warm = (force = false) => navigator.serviceWorker?.controller?.postMessage({ type: "warm", force });
    const back = async () => {
      setOnline(true);
      const n = await flushOutbox();
      if (n) { setJustSynced(n); router.refresh(); setTimeout(() => setJustSynced(0), 5000); }
      warm(true);
    };
    setOnline(navigator.onLine); count();
    if (navigator.onLine) back();
    navigator.serviceWorker?.ready.then(() => warm()).catch(() => {});
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible" && navigator.onLine) { flushOutbox().then(count); warm(); } };
    addEventListener("online", back); addEventListener("offline", off); addEventListener("ja-outbox", count);
    document.addEventListener("visibilitychange", vis);
    return () => { removeEventListener("online", back); removeEventListener("offline", off); removeEventListener("ja-outbox", count); document.removeEventListener("visibilitychange", vis); };
  }, [router]);

  if (online && !justSynced && !waiting) return null;
  if (!online && typeof document !== "undefined" && document.getElementById("ja-offline")) return null; // saved-copy strip already shows the time
  const text = !online
    ? `📴 Offline. You're seeing your saved copy. Answers you type are kept${waiting ? ` (${waiting} waiting)` : ""} and sent later.`
    : justSynced ? `✅ Back online. ${justSynced} answer${justSynced > 1 ? "s" : ""} sent.`
    : `⏳ Sending ${waiting} saved answer${waiting > 1 ? "s" : ""}…`;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-lg text-center max-w-[92vw]"
      style={{ background: online ? "var(--ok, #1f9d55)" : "#1f2430", bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}>
      {text}
    </div>
  );
}
