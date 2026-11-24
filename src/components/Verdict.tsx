import type { Verdict } from "@/lib/verdict";

const TONE: Record<Verdict["tone"], string> = { good: "var(--good)", ok: "var(--accent)", warn: "var(--warn)", bad: "var(--bad)" };

/** Reasons to submit / not submit. Compact on lists (top 2 each), full on the application page. */
export function VerdictView({ v, compact = false }: { v: Verdict; compact?: boolean }) {
  const pros = compact ? v.pros.slice(0, 2) : v.pros;
  const cons = compact ? v.cons.slice(0, 2) : v.cons;
  return (
    <div className={compact ? "space-y-1.5" : "card p-4 space-y-3"}>
      <div className="flex items-center gap-2">
        <span className="chip font-semibold" style={{ color: TONE[v.tone], borderColor: TONE[v.tone] }}>{v.call}</span>
        {!compact && <span className="text-xs text-muted">Based on your CV, visa rules and this job's details</span>}
      </div>
      <div className={compact ? "grid gap-1 text-xs" : "grid md:grid-cols-2 gap-3 text-sm"}>
        <div>
          {!compact && <p className="font-semibold mb-1" style={{ color: "var(--good)" }}>Why submit</p>}
          <ul className="space-y-0.5">{pros.length ? pros.map((p, i) => <li key={i}>✅ {p}</li>) : <li className="text-muted">No strong reasons found</li>}</ul>
        </div>
        <div>
          {!compact && <p className="font-semibold mb-1" style={{ color: "var(--bad)" }}>Why you might not</p>}
          <ul className="space-y-0.5">{cons.length ? cons.map((c, i) => <li key={i}>⚠️ {c}</li>) : <li className="text-muted">{compact ? "✅ No concerns" : "No concerns found"}</li>}</ul>
        </div>
      </div>
    </div>
  );
}
