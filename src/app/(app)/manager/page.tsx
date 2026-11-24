import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Bars, Progress } from "@/components/charts";
import { loadPersona } from "@/lib/persona";
import { orders, season, scorecard, skillGap, moves, tracksState } from "@/lib/manager";
import { toggleMove, toggleLearned } from "@/app/actions";

export const dynamic = "force-dynamic";

/** Your career manager: priorities, season, scorecard, skills gap and monthly moves, worked out from your own data. */
export default async function Manager() {
  await loadPersona();
  const [ord, sc, gap, st] = await Promise.all([orders(), scorecard(), skillGap(), tracksState()]);
  const se = season();
  const missing = gap.rows.filter((g) => !g.have);
  const mv = moves(missing[0]);
  const movesDone = mv.filter((m) => st.done.includes(m.id)).length;
  const monthName = new Date().toLocaleDateString("en-GB", { month: "long" });
  const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

  return (
    <div className="space-y-4">
      <PageHeader title="Manager" subtitle="Your career manager: what to do, why, and how you're doing. Worked out from your own data, every day." />

      {/* 1. Orders */}
      <section className="card p-4 gradient-hero" id="orders">
        <h2 className="font-bold mb-1">This week&apos;s orders</h2>
        <p className="text-xs text-muted mb-2">Highest impact first. Do the top three and the week is a win.</p>
        <ol className="divide-y divide-line">
          {ord.slice(0, 6).map((o, i) => (
            <li key={o.title} className="py-2.5 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: i < 3 ? "var(--accent)" : "var(--surface-2)", color: i < 3 ? "#fff" : "var(--muted)" }}>{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold text-sm leading-snug">{o.icon} {o.title}</p><p className="text-xs text-muted">{o.why}</p></div>
              <Link href={o.href} className={`btn ${i < 3 ? "btn-primary" : "btn-ghost"} !py-1.5 !px-3 !text-xs shrink-0`}>{o.cta}</Link>
            </li>
          ))}
        </ol>
      </section>

      {/* 2. Season */}
      <section className="card p-4" id="season">
        <h2 className="font-bold mb-2">Hiring season</h2>
        <p className="font-semibold" style={{ color: se.tone }}>{se.title}</p>
        <p className="text-sm text-muted mt-1">{se.advice}</p>
        <p className="text-sm mt-2">👉 {se.next}</p>
      </section>

      {/* 3. Scorecard */}
      <section className="card p-4 space-y-3" id="scorecard">
        <h2 className="font-bold">Scorecard</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Sent", sc.sent], ["Tests & interviews", sc.progressed], ["Offers", sc.offers]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}><p className="text-2xl font-black tabular-nums">{v as number}</p><p className="text-[11px] text-muted">{l as string}</p></div>
          ))}
        </div>
        <div className="space-y-2">
          <Progress label="Hear back (any reply)" right={pct(sc.responseRate)} value={sc.responseRate ?? 0} />
          <Progress label="Get to a test or interview" right={pct(sc.progressRate)} value={sc.progressRate ?? 0} color="var(--good)" />
        </div>
        <p className="text-xs text-muted">
          {sc.sent < 10 ? "Rates become meaningful after about 10 applications. For now, focus on volume and quality."
            : (sc.progressRate ?? 0) < 10 ? "Under 10% reach a test or interview: sharpen your answers and pick roles with ✅ recommendations first."
            : "You're converting well. Keep the weekly rhythm and prepare hard for each interview."}
        </p>
        <div>
          <p className="hud-label mb-1">Applications sent per week</p>
          <Bars data={sc.weeks} />
        </div>
        <p className="text-xs text-muted">Last 7 days: {sc.sent7} · last 4 weeks: {sc.sent28} · decided: {sc.decided} of {sc.prepared} prepared ({sc.declined} declined)</p>
      </section>

      {/* 4. Skills gap */}
      <section className="card p-4" id="skills">
        <h2 className="font-bold">Skills employers want</h2>
        <p className="text-xs text-muted mt-1 mb-2">From the {gap.sample} open jobs that suit you best. Red ones aren&apos;t on your CV yet; each has a free course. Learned one? Tick it, then add it to your CV so matching sees it.</p>
        <ul className="space-y-2">
          {gap.rows.slice(0, 12).map((g) => (
            <li key={g.key} className="text-sm">
              <div className="flex items-center gap-2">
                <form action={toggleLearned.bind(null, g.key)}>
                  <button aria-label={g.have ? "On your CV or learned" : "Mark learned"} className="w-5 h-5 rounded border grid place-items-center text-[11px] shrink-0"
                    style={{ borderColor: g.have ? "var(--good)" : "var(--bad)", background: g.have ? "var(--good)" : "transparent", color: "#fff" }}>{g.have ? "✓" : ""}</button>
                </form>
                <span className="flex-1 font-semibold" style={{ color: g.have ? "var(--ink)" : "var(--bad)" }}>{g.label}</span>
                <span className="text-xs text-muted tabular-nums">{g.jobs} jobs · {g.pct}%</span>
              </div>
              <div className="ml-7 mt-1 h-1.5 rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, g.pct)}%`, background: g.have ? "var(--good)" : "var(--bad)" }} />
              </div>
              {!g.have && <a href={g.learn.href} target="_blank" rel="noopener noreferrer" className="ml-7 text-xs text-accent font-semibold">{g.learn.label} ↗</a>}
            </li>
          ))}
          {gap.rows.length === 0 && <li className="text-sm text-muted">Not enough job adverts yet. This fills in as the agent finds jobs.</li>}
        </ul>
      </section>

      {/* 5. Monthly moves */}
      <section className="card p-4" id="moves">
        <div className="flex items-baseline justify-between"><h2 className="font-bold">{monthName}&apos;s career moves</h2><span className="text-xs text-muted">{movesDone}/{mv.length} done</span></div>
        <p className="text-xs text-muted mt-1 mb-2">Applications get interviews; these make you the candidate who gets the offer. Ticks reset each month.</p>
        <ul className="divide-y divide-line">
          {mv.map((m) => {
            const done = st.done.includes(m.id);
            return (
              <li key={m.id} className="py-2.5 flex gap-3 items-start">
                <form action={toggleMove.bind(null, m.id)}>
                  <button aria-label={done ? "Mark not done" : "Mark done"} className="w-6 h-6 rounded-md border grid place-items-center mt-0.5 shrink-0"
                    style={{ borderColor: done ? "var(--good)" : "var(--line)", background: done ? "var(--good)" : "transparent", color: "#fff" }}>{done ? "✓" : ""}</button>
                </form>
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm ${done ? "line-through text-muted" : ""}`}>{m.icon} {m.title}</p>
                  {!done && <p className="text-xs text-muted">{m.why}</p>}
                  {!done && m.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {m.links.map((l) => l.href.startsWith("/") ? <Link key={l.href} href={l.href} className="chip !text-accent">{l.label} →</Link>
                        : <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="chip !text-accent">{l.label} ↗</a>)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-muted text-center">Every Sunday evening you get a short review of your week with next week&apos;s top orders. Advice here is general guidance from your own data, not professional careers or visa advice.</p>
    </div>
  );
}
