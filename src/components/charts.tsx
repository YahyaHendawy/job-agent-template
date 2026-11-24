/** Lightweight animated SVG charts (no libraries). Animations respect "reduce motion". */
export type Seg = { label: string; value: number; color: string };

export const PALETTE = { blue: "var(--accent)", green: "var(--good)", amber: "var(--warn)", red: "var(--bad)", violet: "#8b6cf6", teal: "#22b8b0", grey: "var(--line)" };

/** Donut chart with legend and a centre figure. */
export function Donut({ segments, size = 132, thickness = 16, center, sub }: { segments: Seg[]; size?: number; thickness?: number; center?: string | number; sub?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => {
          const pct = (s.value / total) * 100;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} pathLength={100}
              strokeDasharray={`${Math.max(pct - 0.8, 0.4)} ${100 - Math.max(pct - 0.8, 0.4)}`} strokeDashoffset={-offset} strokeLinecap="butt"
              className="donut-seg" style={{ animationDelay: `${i * 90}ms` }} />
          );
          offset += pct;
          return el;
        })}
        <text x="50%" y="50%" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" dominantBaseline="central" className="fill-[var(--ink)]" style={{ fontSize: size / 5, fontWeight: 700 }}>{center ?? total}</text>
        {sub && <text x="50%" y="66%" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: size / 12 }}>{sub}</text>}
      </svg>
      <ul className="space-y-1.5 text-sm min-w-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-muted truncate">{s.label}</span>
            <span className="font-semibold tabular-nums ml-auto pl-2">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Animated horizontal progress bar. */
export function Progress({ value, max = 100, color = "var(--accent)", label, right, height = 8 }: { value: number; max?: number; color?: string; label?: string; right?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      {(label || right) && <div className="flex justify-between text-xs mb-1"><span className="text-muted">{label}</span><span className="font-semibold tabular-nums">{right}</span></div>}
      <div className="rounded-full overflow-hidden" style={{ height, background: "var(--surface-2)" }}>
        <div className="h-full rounded-full bar-grow" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Vertical bar chart (e.g. last 14 days). */
export function Bars({ data, color = "var(--accent)", height = 64 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex flex-col justify-end h-full group relative" title={`${d.label}: ${d.value}`}>
            <div className="rounded-t-sm col-grow" style={{ height: `${Math.max((d.value / max) * 100, d.value ? 6 : 2)}%`, background: d.value ? color : "var(--surface-2)", animationDelay: `${i * 25}ms` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
    </div>
  );
}

/** Application stage tracker: Prepared → Submitted → Test → Interview → Offer. */
const STEPS = ["Prepared", "Submitted", "Test", "Interview", "Offer"];
const STEP_OF: Record<string, number> = { draft: 0, preparing: 0, awaiting_approval: 0, approved: 0, submitting: 1, submitted: 1, assessment: 2, interview: 3, offer: 4 };
export function Stepper({ status, compact = false }: { status: string; compact?: boolean }) {
  const rejected = status === "rejected" || status === "withdrawn" || status === "declined";
  const cur = STEP_OF[status] ?? 0;
  return (
    <div className="flex items-center gap-1 w-full" aria-label={`Stage: ${status}`}>
      {STEPS.map((s, i) => {
        const done = !rejected && i <= cur;
        return (
          <div key={s} className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bar-grow" style={{ background: done ? (i === 4 ? "var(--good)" : "var(--accent)") : rejected && i <= cur ? "var(--bad)" : "var(--surface-2)", animationDelay: `${i * 70}ms` }} />
            {!compact && <p className={`text-[10px] mt-1 truncate ${done ? "font-semibold" : "text-muted"}`}>{s}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Circular score ring (match score). */
export function Ring({ value, size = 44, stroke = 4.5 }: { value: number; size?: number; stroke?: number }) {
  const color = value >= 70 ? "var(--good)" : value >= 45 ? "var(--warn)" : "var(--muted)";
  const r = (size - stroke) / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} pathLength={100} strokeLinecap="round"
          strokeDasharray={`${value} ${100 - value}`} className="donut-seg" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
