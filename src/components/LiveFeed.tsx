"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type FeedEvent = {
  id: number; ts: string; type: string; level: string; title: string; body: string | null; url: string | null; simulated: boolean;
};

const COLOR: Record<string, string> = { info: "var(--muted)", success: "var(--good)", warning: "var(--warn)", error: "var(--bad)" };

export function LiveFeed({ initial, limit = 200, refreshOnEvent = false, filter, live: liveOn = true }: { initial: FeedEvent[]; limit?: number; refreshOnEvent?: boolean; filter?: string; live?: boolean }) {
  const [events, setEvents] = useState(initial);
  const [live, setLive] = useState(false);
  const router = useRouter();

  const since = useRef(initial[0]?.id ?? 0);
  useEffect(() => {
    if (!liveOn) return;
    let stopped = false, busy = false;
    const poll = async () => {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch(`/api/events?since=${since.current}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const all: FeedEvent[] = await r.json();
        const f = filter?.toLowerCase();
        const fresh = f ? all.filter((e) => `${e.title} ${e.body ?? ""}`.toLowerCase().includes(f)) : all;
        if (all.length) since.current = Math.max(since.current, ...all.map((e) => e.id));
        setLive(true);
        if (fresh.length) {
          since.current = Math.max(since.current, ...fresh.map((e) => e.id));
          setEvents((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...fresh.filter((e) => !ids.has(e.id)).reverse(), ...prev].slice(0, limit);
          });
          if (refreshOnEvent) router.refresh();
        }
      } catch { setLive(false); } finally { busy = false; }
    };
    poll();
    const t = setInterval(poll, 4000);
    const onVis = () => poll();
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [limit, refreshOnEvent, router, filter, liveOn]);

  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted mb-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: live ? "var(--good)" : "var(--muted)" }} />
        {!liveOn ? "Paused (filtered)" : live ? "Live" : "Connecting…"}
      </div>
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="card px-3.5 py-3">
            <Link href={e.url ?? "/activity"} className="flex gap-3">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: COLOR[e.level] ?? COLOR.info }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="font-semibold text-[0.92rem] leading-snug flex-1">{e.title}</p>
                  {e.simulated && <span className="chip" style={{ color: "var(--warn)" }}>Simulated</span>}
                </div>
                {e.body && <p className="text-sm text-muted mt-0.5 break-words whitespace-pre-line">{e.body}</p>}
                <p className="text-[11px] text-muted mt-1 tabular-nums">
                  {new Date(e.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {e.type.replace(/_/g, " ")}
                </p>
              </div>
            </Link>
          </li>
        ))}
        {events.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
      </ol>
    </div>
  );
}
