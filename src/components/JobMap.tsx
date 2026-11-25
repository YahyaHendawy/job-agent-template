"use client";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LMap, Marker } from "leaflet";

export type MapJob = {
  id: string; appId: string | null; title: string; employer: string; location: string | null; match: number | null; type: string;
  elig: string; eligColor: string; status: string | null; deadline: string | null; salary: string | null;
  chance: number; chanceLabel: string; chanceTone: "good" | "ok" | "warn" | "bad";
};
export type MapPlace = { id: string; lat: number; lng: number; precise: boolean; country: string | null; label: string; jobs: MapJob[] };

const TONE = { good: "#22c55e", ok: "#e11d2e", warn: "#f59e0b", bad: "#8b8f9a" } as const;
const RANK = { good: 3, ok: 2, warn: 1, bad: 0 } as const;
const COUNTRY: Record<string, string> = { UK: "🇬🇧 UK", QA: "🇶🇦 Qatar", EG: "🇪🇬 Egypt", REMOTE: "🌐 Remote" };
const daysTo = (d: string | null) => (d ? Math.ceil((Date.parse(d) - Date.now()) / 86400000) : null);

/** Interactive map: pinch/scroll to zoom, tap a pin to see its jobs, jump straight to any job. Free dark map tiles, no key. */
export function JobMap({ places, home }: { places: MapPlace[]; home: { label: string; country: string } | null }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const [sel, setSel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const selected = places.find((p) => p.id === sel) ?? null;

  const regions = useMemo(() => {
    const by = new Map<string, MapPlace[]>();
    for (const p of places) { const c = p.country ?? "?"; by.set(c, [...(by.get(c) ?? []), p]); }
    return [...by.entries()].map(([c, ps]) => ({ code: c, label: COUNTRY[c] ?? c, n: ps.reduce((n, p) => n + p.jobs.length, 0), ps })).sort((a, b) => b.n - a.n);
  }, [places]);

  // Build the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, tapTolerance: 20 }).setView([51.5, -0.12], 5);
      // OpenStreetMap's own tiles: free, no key (darkened with CSS to match the app)
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, className: "jm-tiles", attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      // Keep the map sized right as the page lays out or the phone rotates
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(box.current);
      setTimeout(() => m.invalidateSize(), 250);
      L.control.zoom({ position: "topright" }).addTo(m);
      m.on("click", () => setSel(null));
      map.current = m;
      setReady(true);
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; markers.current.clear(); };
  }, []);

  // Pins (redrawn when filters change)
  useEffect(() => {
    if (!ready || !map.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const m = map.current!;
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      for (const p of places) {
        const best = p.jobs.reduce((b, j) => (RANK[j.chanceTone] > RANK[b] ? j.chanceTone : b), "bad" as MapJob["chanceTone"]);
        const n = p.jobs.length, size = Math.min(54, 26 + Math.round(Math.sqrt(n) * 6));
        const icon = L.divIcon({
          className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="jm-pin${p.id === sel ? " jm-on" : ""}" style="--c:${TONE[best]};width:${size}px;height:${size}px">${n}${p.precise ? "" : "<i>≈</i>"}</div>`,
        });
        const mk = L.marker([p.lat, p.lng], { icon, title: `${p.label}: ${n} job${n > 1 ? "s" : ""}`, keyboard: true, riseOnHover: true })
          .on("click", (e) => { L.DomEvent.stopPropagation(e); setSel(p.id); })
          .addTo(m);
        markers.current.set(p.id, mk);
      }
      if (places.length && !sel) m.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])).pad(0.25), { maxZoom: 11 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, places]);

  // Highlight the selected pin and bring it into view
  useEffect(() => {
    markers.current.forEach((mk, id) => mk.getElement()?.querySelector(".jm-pin")?.classList.toggle("jm-on", id === sel));
    if (selected && map.current) map.current.panTo([selected.lat, selected.lng], { animate: true });
  }, [sel, selected]);

  const fly = async (ps: MapPlace[]) => {
    const L = (await import("leaflet")).default;
    if (!map.current || !ps.length) return;
    setSel(null);
    if (ps.length === 1) map.current.flyTo([ps[0].lat, ps[0].lng], 12, { duration: 0.8 });
    else map.current.flyToBounds(L.latLngBounds(ps.map((p) => [p.lat, p.lng] as [number, number])).pad(0.25), { maxZoom: 11, duration: 0.8 });
  };
  const pick = (p: MapPlace) => { setSel(p.id); map.current?.flyTo([p.lat, p.lng], Math.max(map.current.getZoom(), 11), { duration: 0.8 }); box.current?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  return (
    <div className="space-y-3">
      {/* Quick jumps */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        <button type="button" className="chip !py-1.5 shrink-0" onClick={() => fly(places)}>🌍 All ({places.reduce((n, p) => n + p.jobs.length, 0)})</button>
        {regions.map((r) => <button key={r.code} type="button" className="chip !py-1.5 shrink-0" onClick={() => fly(r.ps)}>{r.label} ({r.n})</button>)}
        {home && <button type="button" className="chip !py-1.5 shrink-0" onClick={() => { const ps = places.filter((p) => p.label.toLowerCase().includes(home.label.toLowerCase())); fly(ps.length ? ps : places); }}>🏠 {home.label}</button>}
      </div>

      <div className="relative rounded-xl overflow-hidden border border-line" style={{ height: "min(68dvh, 640px)", minHeight: 380 }}>
        <div ref={box} className="absolute inset-0 jm" aria-label="Map of jobs" />
        {!places.length && <div className="absolute inset-0 grid place-items-center text-sm text-muted pointer-events-none">No jobs to show with these filters</div>}

        {/* Bottom sheet with the jobs at the tapped pin */}
        {selected && (
          <div className="absolute left-2 right-2 bottom-2 z-[500] card p-3 max-h-[58%] flex flex-col" style={{ background: "rgba(10,10,13,.96)" }} role="dialog" aria-label={`Jobs in ${selected.label}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">📍 {selected.label}{selected.precise ? "" : " (approx.)"}</p>
                <p className="text-xs text-muted">{selected.jobs.length} job{selected.jobs.length > 1 ? "s" : ""} · best chance first</p>
              </div>
              <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" onClick={() => map.current?.flyTo([selected.lat, selected.lng], 14, { duration: 0.8 })}>Zoom</button>
              <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" aria-label="Close" onClick={() => setSel(null)}>✕</button>
            </div>
            <ul className="overflow-y-auto divide-y divide-line -mx-1 px-1">
              {selected.jobs.map((j) => {
                const d = daysTo(j.deadline);
                return (
                  <li key={j.id} className="py-2">
                    <Link href={j.appId ? `/applications/${j.appId}` : `/jobs/${j.id}`} className="block">
                      <p className="font-semibold text-sm leading-snug">{j.title}</p>
                      <p className="text-xs text-muted truncate">{j.employer}{j.location ? ` · ${j.location}` : ""}</p>
                      <div className="flex flex-wrap gap-1 mt-1 text-[11px]">
                        <span className="chip !py-0.5 font-semibold" style={{ color: TONE[j.chanceTone] }}>🎯 ~{j.chance}% · {j.chanceLabel}</span>
                        {j.match != null && <span className="chip !py-0.5">{j.match}% match</span>}
                        <span className="chip !py-0.5">{j.type}</span>
                        <span className="chip !py-0.5" style={{ color: j.eligColor }}>{j.elig}</span>
                        {j.status && <span className="chip !py-0.5" style={{ color: "var(--accent)" }}>{j.status}</span>}
                        {j.salary && <span className="chip !py-0.5">{j.salary}</span>}
                        {d != null && d >= 0 && <span className="chip !py-0.5" style={{ color: d <= 7 ? "var(--bad)" : "var(--warn)" }}>Closes {d === 0 ? "today" : `in ${d}d`}</span>}
                      </div>
                      <p className="text-xs text-accent font-semibold mt-1">{j.appId ? "Open application →" : "Open job →"}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Places list: tap to fly there */}
      {places.length > 0 && (
        <details className="card p-3" open={places.length <= 8}>
          <summary className="font-semibold text-sm cursor-pointer select-none">📍 {places.length} place{places.length > 1 ? "s" : ""}: tap one to fly there</summary>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {[...places].sort((a, b) => b.jobs.length - a.jobs.length).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p)} className="w-full text-left rounded-lg px-2.5 py-2 text-sm flex items-center gap-2" style={{ background: "var(--surface-2)" }}>
                  <span className="flex-1 truncate">{p.label}{p.precise ? "" : " ≈"}</span>
                  <span className="chip !py-0.5 tabular-nums">{p.jobs.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
