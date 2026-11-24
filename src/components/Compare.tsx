"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pick up to 4 jobs/applications on any list or page, then compare them side by side. Kept on this device. */
const KEY = "ja-compare-v1";
const MAX = 4;
type Item = { id: string; label: string };

function read(): Item[] { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
function write(list: Item[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} window.dispatchEvent(new Event("ja-compare")); }

function useCompare() {
  const [list, setList] = useState<Item[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync(); addEventListener("ja-compare", sync); addEventListener("storage", sync);
    return () => { removeEventListener("ja-compare", sync); removeEventListener("storage", sync); };
  }, []);
  return list;
}

/** "⇄ Compare" tick for a job (by job id). Safe to put inside a card link. */
export function CompareToggle({ jobId, label, big = false }: { jobId: string; label: string; big?: boolean }) {
  const list = useCompare();
  const on = list.some((x) => x.id === jobId);
  const full = !on && list.length >= MAX;
  return (
    <button type="button" aria-pressed={on} disabled={full} title={full ? `You can compare up to ${MAX}` : on ? "Remove from compare" : "Add to compare"}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        const cur = read();
        write(cur.some((x) => x.id === jobId) ? cur.filter((x) => x.id !== jobId) : [...cur, { id: jobId, label }].slice(-MAX));
      }}
      className={`chip shrink-0 !py-1 font-semibold ${big ? "!px-3 !text-sm" : ""} ${full ? "opacity-40" : ""}`}
      style={on ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}>
      {on ? "✓ Comparing" : "⇄ Compare"}
    </button>
  );
}

/** Floating bar shown while anything is picked. */
export function CompareBar() {
  const list = useCompare();
  const path = usePathname();
  if (!list.length || path.startsWith("/compare")) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-40 card !rounded-full px-3 py-2 flex items-center gap-2 shadow-lg text-sm max-w-[94vw]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}>
      <span className="font-semibold whitespace-nowrap">⇄ {list.length} picked</span>
      <span className="text-muted truncate hidden sm:inline max-w-64">{list.map((x) => x.label).join(", ")}</span>
      {list.length >= 2
        ? <Link href={`/compare?ids=${list.map((x) => x.id).join(",")}`} className="btn btn-primary !py-1.5 !text-sm whitespace-nowrap">Compare →</Link>
        : <span className="text-xs text-muted whitespace-nowrap">pick 1 more</span>}
      <button type="button" onClick={() => write([])} className="text-xs text-muted underline">Clear</button>
    </div>
  );
}

/** On the compare page: remove one column / clear all, keeping the URL in step. */
export function CompareRemove({ jobId, ids }: { jobId: string; ids: string[] }) {
  return (
    <button type="button" className="text-xs text-muted underline" onClick={() => {
      write(read().filter((x) => x.id !== jobId));
      const rest = ids.filter((x) => x !== jobId);
      location.href = rest.length ? `/compare?ids=${rest.join(",")}` : "/applications";
    }}>Remove</button>
  );
}

/** Makes sure what's on the compare page is also what's picked (e.g. after opening a shared link). */
export function CompareSync({ items }: { items: Item[] }) {
  useEffect(() => { write(items); }, [items]);
  return null;
}
