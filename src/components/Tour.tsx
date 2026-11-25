"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Small "New here?" strip at the very top of Home. Hide it with ✕ (remembered on this device); the tour stays in ☰ Jump. */
export function TourBanner() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem("tour-hidden") === "1"); } catch { setHidden(false); } }, []);
  if (hidden) return null;
  return (
    <div className="card px-3 py-2 flex items-center gap-2 text-sm" data-jump="Tour">
      <span className="text-lg">🧭</span>
      <p className="flex-1 min-w-0"><b>New here?</b> <span className="text-muted">A 2-minute tour of everything the app does.</span></p>
      <Link href="/tour" className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0">Start tour</Link>
      <button type="button" aria-label="Hide the tour banner" className="text-muted px-1" onClick={() => { setHidden(true); try { localStorage.setItem("tour-hidden", "1"); } catch {} }}>✕</button>
    </div>
  );
}

export type TourStep = { icon: string; title: string; body: string[]; href: string; cta: string };

/** Step-by-step tour: one screen at a time, with a button to try each part. */
export function TourSteps({ steps }: { steps: TourStep[] }) {
  const [i, setI] = useState(0);
  const s = steps[i];
  return (
    <div className="space-y-3">
      <div className="flex gap-1" aria-hidden>
        {steps.map((_, k) => <button key={k} type="button" onClick={() => setI(k)} className="h-1.5 flex-1 rounded-full" style={{ background: k <= i ? "var(--accent)" : "var(--surface-2)" }} />)}
      </div>
      <section className="card p-5 gradient-hero min-h-72 flex flex-col" aria-live="polite">
        <p className="hud-label">Step {i + 1} of {steps.length}</p>
        <p className="text-4xl mt-3">{s.icon}</p>
        <h2 className="!text-xl !normal-case !tracking-normal font-black mt-2" style={{ fontFamily: "inherit", color: "var(--ink)" }}>{s.title}</h2>
        <ul className="mt-3 space-y-2 text-sm flex-1">{s.body.map((b, k) => <li key={k} className="flex gap-2"><span style={{ color: "var(--accent)" }}>▸</span><span>{b}</span></li>)}</ul>
        <Link href={s.href} className="btn btn-ghost mt-4 self-start !text-sm">{s.cta} →</Link>
      </section>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" disabled={i === 0} onClick={() => setI(i - 1)} style={{ opacity: i === 0 ? 0.4 : 1 }}>← Back</button>
        {i < steps.length - 1
          ? <button type="button" className="btn btn-primary flex-[2]" onClick={() => setI(i + 1)}>Next →</button>
          : <Link href="/" className="btn btn-primary flex-[2]">Finish: go to Home ✓</Link>}
      </div>
      <details className="card p-3 text-sm"><summary className="font-semibold cursor-pointer">All steps</summary>
        <ol className="mt-2 space-y-1">{steps.map((t, k) => <li key={k}><button type="button" className="text-left hover:underline" onClick={() => setI(k)}>{k + 1}. {t.icon} {t.title}</button></li>)}</ol>
      </details>
    </div>
  );
}
