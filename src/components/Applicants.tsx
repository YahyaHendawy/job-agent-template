"use client";
import { useEffect, useState } from "react";
import { type ApplicantsModel, applicantsAt } from "@/lib/applicants";

/** Live, ticking estimate of how many people have applied. */
export function ApplicantsCounter({ m, compact = false }: { m: ApplicantsModel; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const v = applicantsAt(m, now ?? m.start + 1);
  const closed = m.end != null && (now ?? 0) > m.end;
  const n = Math.round(v.n);
  const per = Math.max(1, Math.round(n / m.places));
  if (compact) return <span className="chip tabular-nums" title={`Estimated applicants so far for ${m.places} place${m.places > 1 ? "s" : ""}`}>👥 ~{n} for {m.places}{closed ? "" : " ▲"}</span>;
  return (
    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--surface-2)" }}>
      <span className="relative flex w-2.5 h-2.5 shrink-0">
        {!closed && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: "var(--accent)" }} />}
        <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: closed ? "var(--muted)" : "var(--accent)" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm"><b className="text-2xl font-black tabular-nums">~{n.toLocaleString("en-GB")}</b> <span className="text-muted">applicants so far for</span> <b className="text-lg tabular-nums">{m.places}</b> <span className="text-muted">place{m.places > 1 ? "s" : ""}{m.placesStated ? " (from the advert)" : " (typical)"}</span></p>
        <p className="text-xs"><b className="tabular-nums" style={{ color: per > 30 ? "var(--bad)" : per > 10 ? "var(--warn)" : "var(--good)" }}>≈ {per} applicant{per > 1 ? "s" : ""} per place</b></p>
        <p className="text-xs text-muted">Likely between {v.low.toLocaleString("en-GB")} and {v.high.toLocaleString("en-GB")}{closed ? " · closed" : ` · about +${Math.max(1, Math.round(v.perDay))} a day right now`}</p>
      </div>
    </div>
  );
}
