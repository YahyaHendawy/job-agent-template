import Link from "next/link";
import { weekly, weeklyState } from "@/lib/guide";
import { loadPersona } from "@/lib/persona";
import { toggleWeeklyItem } from "@/app/actions";

/** The weekly do-it-yourself routine. compact = Home card; full = Guide page with all links. */
export async function WeeklyCard({ compact = false }: { compact?: boolean }) {
  await loadPersona();
  const W = weekly();
  const st = await weeklyState();
  const done = W.filter((w) => st.done.includes(w.id)).length;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-bold text-lg">Weekly job sites</h2>
        <span className="text-xs text-muted">{done}/{W.length} done · about 30 min</span>
      </div>
      <div className="h-1.5 rounded-full mb-3" style={{ background: "var(--surface-2)" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${(done / W.length) * 100}%`, background: "var(--good)" }} />
      </div>
      <ul className="space-y-3">
        {W.map((w) => {
          const isDone = st.done.includes(w.id);
          return (
            <li key={w.id} className="flex gap-3 items-start">
              <form action={toggleWeeklyItem.bind(null, w.id)}>
                <button aria-label={isDone ? "Mark not done" : "Mark done"} className="w-6 h-6 rounded-md border grid place-items-center mt-0.5 shrink-0"
                  style={{ borderColor: isDone ? "var(--good)" : "var(--line)", background: isDone ? "var(--good)" : "transparent", color: "#fff" }}>{isDone ? "✓" : ""}</button>
              </form>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold text-sm ${isDone ? "line-through text-muted" : ""}`}>{w.title}</p>
                {!compact && <p className="text-xs text-muted">{w.why}</p>}
                {!isDone && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(compact ? w.links.slice(0, 2) : w.links).map((l) => (
                      <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="chip !text-accent">{l.label} ↗</a>
                    ))}
                    {compact && w.links.length > 2 && <Link href="/todo#sites" className="chip">+{w.links.length - 2} more</Link>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 mt-4">
        <Link href="/jobs/new" className="btn btn-primary flex-1 !text-sm">Found a job? Add it by link</Link>
        {compact && <Link href="/todo" className="btn btn-ghost !text-sm">Solo</Link>}
      </div>
    </section>
  );
}
