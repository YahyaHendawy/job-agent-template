import { type Chance, chanceColor } from "@/lib/chance";

/** Small "🎯 ~10% · Possible" chip for lists. */
export function ChanceChip({ c }: { c: Chance }) {
  return <span className="chip font-semibold tabular-nums" style={{ color: chanceColor(c.tone) }} title="Estimated chance of an offer">🎯 {c.pct === 100 ? "Offer" : `~${c.pct}%`} · {c.label}</span>;
}

/** Full view: estimate, gauge, why you could and why you couldn't get accepted. */
export function ChanceView({ c, compact = false }: { c: Chance; compact?: boolean }) {
  const col = chanceColor(c.tone);
  const could = compact ? c.could.slice(0, 2) : c.could;
  const couldnt = compact ? c.couldnt.slice(0, 2) : c.couldnt;
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <p className="text-4xl font-black tabular-nums leading-none" style={{ color: col }}>{c.pct === 100 ? "🎉" : `~${c.pct}%`}</p>
        <div className="flex-1 min-w-0">
          <p className="font-bold" style={{ color: col }}>{c.label}</p>
          <p className="text-xs text-muted">{c.stage ?? c.basis}</p>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-2 rounded-full" style={{ width: `${Math.max(2, c.pct)}%`, background: col, boxShadow: `0 0 10px ${col}` }} />
      </div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-semibold mb-1" style={{ color: "var(--good)" }}>Why you could get it</p>
          <ul className="space-y-0.5">{could.length ? could.map((x, i) => <li key={i}>👍 {x}</li>) : <li className="text-muted">Nothing stands out yet</li>}</ul>
        </div>
        <div>
          <p className="font-semibold mb-1" style={{ color: "var(--bad)" }}>Why you might not</p>
          <ul className="space-y-0.5">{couldnt.length ? couldnt.map((x, i) => <li key={i}>👎 {x}</li>) : <li className="text-muted">No obvious obstacles</li>}</ul>
        </div>
      </div>
      {!compact && <p className="text-xs text-muted">A rough estimate from this job's details, your CV, visa fit, timing and your answers. Employers don&apos;t publish acceptance rates, so treat it as a guide. Raise it by writing strong answers, applying early and closing the gaps above.</p>}
    </div>
  );
}
