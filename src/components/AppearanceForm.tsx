"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type Appearance, DEFAULT_APPEARANCE, THEMES, ALL_TABS, appearanceCss } from "@/lib/look";
import { saveAppearance } from "@/app/actions";

type Opt<T extends string> = [T, string];

/* Module-level helpers: defined outside the form so inputs keep focus while you type. */
function Seg({ value, onPick, opts }: { value: string; onPick: (v: string) => void; opts: Opt<string>[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onPick(v)} className={`chip !py-1.5 ${value === v ? "jump-on" : ""}`} aria-pressed={value === v}>{l}</button>
      ))}
    </div>
  );
}
function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer">
      <span className="flex-1 min-w-0"><span className="text-sm font-semibold block">{label}</span>{sub && <span className="text-xs text-muted">{sub}</span>}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-[var(--accent)]" />
    </label>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card p-4 space-y-3"><h2 className="font-bold">{title}</h2>{children}</section>;
}

/** Every look-and-feel choice, previewed live on this screen as you change it; Save applies it everywhere. */
export function AppearanceForm({ initial }: { initial: Appearance }) {
  const [a, setA] = useState<Appearance>(initial);
  const [saved, setSaved] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => { setA((x) => ({ ...x, [k]: v })); setSaved(false); };

  // Live preview: swap the page's appearance styles as you change things
  useEffect(() => {
    let el = document.getElementById("appearance") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "appearance"; document.head.appendChild(el); }
    el.textContent = appearanceCss(a);
  }, [a]);

  // Leaving without saving puts the saved look back
  const kept = useRef(initial);
  useEffect(() => () => { const el = document.getElementById("appearance"); if (el) el.textContent = appearanceCss(kept.current); }, []);
  const save = () => start(async () => { await saveAppearance(JSON.stringify(a)); kept.current = a; setSaved(true); router.refresh(); });
  const reset = () => { setA(DEFAULT_APPEARANCE); setSaved(false); };

  const HOME: [keyof Appearance["home"], string][] = [["search", "Search box"], ["status", "Agent status panel"], ["manager", "Your manager"], ["needs", "Needs you"], ["goal", "Weekly goal"], ["tiles", "Number tiles"], ["progress", "Progress charts"], ["matches", "Top matches"], ["activity", "Recent activity"]];

  return (
    <div className="space-y-4 pb-24">
      <Block title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(THEMES) as [Appearance["theme"], (typeof THEMES)[keyof typeof THEMES]][]).map(([k, t]) => (
            <button key={k} type="button" onClick={() => { set("theme", k); set("accent", ""); }}
              className={`rounded-xl p-3 text-left border ${a.theme === k ? "jump-on" : ""}`} style={{ background: t.dark ? "#0d0d10" : "#f3f4f6", borderColor: a.theme === k ? t.accent : "var(--line)" }}>
              <span className="flex gap-1 mb-1.5"><span className="w-5 h-5 rounded-full" style={{ background: t.accent }} /><span className="w-5 h-5 rounded-full" style={{ background: t.accent2 }} /></span>
              <span className="text-xs font-semibold" style={{ color: t.dark ? "#eceef2" : "#111318" }}>{t.label}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className="flex-1 font-semibold">Your own accent colour</span>
          <input type="color" value={a.accent || THEMES[a.theme].accent} onChange={(e) => set("accent", e.target.value)} className="w-12 h-9 rounded bg-transparent" aria-label="Accent colour" />
          {a.accent && <button type="button" className="text-xs text-accent" onClick={() => set("accent", "")}>Use theme&apos;s</button>}
        </label>
      </Block>

      <Block title="Text and shape">
        <p className="text-xs text-muted">Font</p>
        <Seg value={a.font} onPick={(v) => set("font", v as never)} opts={[["system", "Standard"], ["rounded", "Rounded"], ["mono", "Terminal"], ["serif", "Serif"]]} />
        <p className="text-xs text-muted">Text size</p>
        <Seg value={a.textSize} onPick={(v) => set("textSize", v as never)} opts={[["s", "Small"], ["m", "Normal"], ["l", "Large"], ["xl", "Extra large"]]} />
        <p className="text-xs text-muted">Corners</p>
        <Seg value={a.corners} onPick={(v) => set("corners", v as never)} opts={[["sharp", "Sharp"], ["normal", "Normal"], ["round", "Round"]]} />
        <p className="text-xs text-muted">Cards</p>
        <Seg value={a.cards} onPick={(v) => set("cards", v as never)} opts={[["glass", "Glass"], ["solid", "Solid"], ["outline", "Outline only"]]} />
        <Toggle on={a.hudHeadings} onChange={(v) => set("hudHeadings", v)} label="Terminal-style section headings" sub="Spaced capitals in a computer font" />
      </Block>

      <Block title="Effects and motion">
        <p className="text-xs text-muted">Motion</p>
        <Seg value={a.motion} onPick={(v) => set("motion", v as never)} opts={[["full", "Full"], ["calm", "Calm"], ["off", "Off"]]} />
        <div className="divide-y divide-line">
          <Toggle on={a.glow} onChange={(v) => set("glow", v)} label="Background glow" />
          <Toggle on={a.grid} onChange={(v) => set("grid", v)} label="Background grid" />
          <Toggle on={a.scanner} onChange={(v) => set("scanner", v)} label="Corner brackets and scan line on the status panel" />
        </div>
      </Block>

      <Block title="Home">
        <label className="block text-sm"><span className="font-semibold">Greeting word</span>
          <input value={a.greeting} maxLength={24} onChange={(e) => set("greeting", e.target.value)} placeholder="Greetings" className="input mt-1" /></label>
        <div className="divide-y divide-line">
          <Toggle on={a.showDate} onChange={(v) => set("showDate", v)} label="“Systems online” line with the date" />
          {HOME.map(([k, l]) => <Toggle key={k} on={a.home[k]} onChange={(v) => set("home", { ...a.home, [k]: v })} label={`Show ${l}`} />)}
        </div>
      </Block>

      <Block title="Bottom bar (phone)">
        <p className="text-xs text-muted">Pick 2 to 7 tabs. They appear in this order. Everything else is always in ☰ Jump.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TABS.map((t) => {
            const on = a.tabs.includes(t.href);
            return (
              <button key={t.href} type="button" aria-pressed={on} className={`chip !py-2 justify-start ${on ? "jump-on" : ""}`}
                onClick={() => {
                  const next = on ? a.tabs.filter((x) => x !== t.href) : [...a.tabs, t.href];
                  if (next.length < 2 || next.length > 7) return;
                  set("tabs", ALL_TABS.map((x) => x.href).filter((h) => next.includes(h)));
                }}>{on ? "✓ " : "+ "}{t.label}</button>
            );
          })}
        </div>
        <div className="divide-y divide-line">
          <Toggle on={a.tabLabels} onChange={(v) => set("tabLabels", v)} label="Show tab names under the icons" />
          <Toggle on={a.badges} onChange={(v) => set("badges", v)} label="Red count badges" />
        </div>
      </Block>

      <Block title="Helpers">
        <div className="divide-y divide-line">
          <Toggle on={a.jumpBar} onChange={(v) => set("jumpBar", v)} label="Jump bar at the top of every screen" sub="Section chips and ☰ Jump (⌘K still works on a Mac)" />
          <Toggle on={a.reminders} onChange={(v) => set("reminders", v)} label="“Things I can't do here” reminders" sub="The full list stays in Solo and Settings" />
        </div>
      </Block>

      <div className="fixed left-0 right-0 z-40 px-4 md:pl-64" style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}>
        <div className="mx-auto max-w-4xl card p-2 flex gap-2 items-center" style={{ background: "var(--surface)" }}>
          <span className="text-xs text-muted flex-1 pl-1">{saved ? "✓ Saved: applies on all your devices" : "Previewing. Save to keep it."}</span>
          <button type="button" className="btn btn-ghost !text-sm" onClick={reset}>Reset</button>
          <button type="button" className="btn btn-primary !text-sm" disabled={saved || pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
