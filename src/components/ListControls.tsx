"use client";
import { useState } from "react";

export type Opt = [value: string, label: string];
export type FilterDef = { name: string; label: string; options: Opt[]; all?: string };

/**
 * One search + sort + filter bar used on every list. It's a plain GET form (works offline from a saved
 * page and with the back button); choosing an option applies it instantly. Active filters show as chips.
 */
export function ListControls({ action, params, placeholder, sorts, filters, count, keep = [] }: {
  action: string; params: Record<string, string | undefined>; placeholder: string;
  sorts: Opt[]; filters: FilterDef[]; count?: number; keep?: string[];
}) {
  const active = filters.filter((f) => params[f.name]);
  const [open, setOpen] = useState(false);
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  const hrefWithout = (name: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== name) u.set(k, v);
    const s = u.toString();
    return s ? `${action}?${s}` : action;
  };
  const clearAll = (() => {
    const u = new URLSearchParams();
    for (const k of keep) if (params[k]) u.set(k, params[k]!);
    const s = u.toString();
    return s ? `${action}?${s}` : action;
  })();
  const labelOf = (f: FilterDef) => f.options.find(([v]) => v === params[f.name])?.[1] ?? params[f.name];

  return (
    <form action={action} method="get" role="search" className="mb-3 space-y-2">
      {keep.filter((k) => params[k]).map((k) => <input key={k} type="hidden" name={k} value={params[k]} />)}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input name="q" type="search" defaultValue={params.q ?? ""} placeholder={placeholder} className="input !pl-9 !py-2" enterKeyHint="search" autoComplete="off" />
        </div>
        <button className="btn btn-primary !py-2">Search</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted font-semibold">Sort</span>
          <select name="sort" defaultValue={params.sort ?? sorts[0]?.[0]} onChange={submit} className="input !py-1.5 !text-sm !w-auto">
            {sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {filters.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={`btn !py-1.5 !text-sm ${active.length ? "btn-primary" : "btn-ghost"}`} aria-expanded={open}>
            ⚙︎ Filters{active.length ? ` · ${active.length}` : ""}
          </button>
        )}
        {typeof count === "number" && <span className="text-sm text-muted ml-auto tabular-nums">{count} result{count === 1 ? "" : "s"}</span>}
      </div>
      {/* filters stay in the form even when folded, so their values are kept on every change */}
      <div className={open ? "card p-3 grid grid-cols-2 lg:grid-cols-3 gap-2" : "hidden"}>
        {filters.map((f) => (
          <label key={f.name} className="text-xs">
            <span className="text-muted font-semibold">{f.label}</span>
            <select name={f.name} defaultValue={params[f.name] ?? ""} onChange={submit} className="input !py-1.5 !text-sm mt-0.5">
              <option value="">{f.all ?? "Any"}</option>
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {active.map((f) => (
            <a key={f.name} href={hrefWithout(f.name)} className="chip !py-1" title="Remove this filter">{f.label}: {labelOf(f)} ✕</a>
          ))}
          <a href={clearAll} className="chip !py-1 text-accent">Clear all</a>
        </div>
      )}
      <noscript><button className="btn btn-ghost !text-sm">Apply</button></noscript>
    </form>
  );
}
