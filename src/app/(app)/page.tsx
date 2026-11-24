import Link from "next/link";
import { persona, countryName, loadPersona } from "@/lib/persona";
import { pool } from "@/db";
import { ControlButtons } from "@/components/ControlButtons";
import { LiveFeed } from "@/components/LiveFeed";
import { timeAgo, Score, EligChip } from "@/components/ui";
import { TodoList } from "@/components/TodoList";
import { SearchBox } from "@/components/SearchBox";
import { WeeklyCard } from "@/components/WeeklyCard";
import { GoalCard } from "@/components/GoalCard";
import { Donut, Bars, Progress, PALETTE } from "@/components/charts";
import { CountUp } from "@/components/CountUp";

export default async function Home() {
  const PS = await loadPersona();
  const shown = [...new Set([PS.home.country, ...PS.markets.map((m) => m.code)])].filter((c) => PS.markets.some((m) => m.code === c)).slice(0, 4);
  const TZ = PS.timeZone;
  const [st, stats, approvals, top, events] = await Promise.all([
    pool.query(`select * from agent_state where id = 1`),
    pool.query(`select
      (select count(*)::int from jobs where listing_status <> 'hidden' and discovered_at >= date_trunc('day', now() at time zone '${TZ}') at time zone '${TZ}') as today,
      (select count(*)::int from jobs where listing_status = 'open') as open,
      (select count(*)::int from applications where status in ('awaiting_approval','approved')) as prepared,
      (select count(*)::int from applications where status in ('submitted','assessment','interview','offer')) as submitted`),
    pool.query(`select a.id, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.status = 'awaiting_approval' order by a.updated_at desc limit 5`),
    pool.query(`select id, title, employer, location, match_score, eligibility from jobs where listing_status = 'open' and not dismissed and eligibility <> 'ineligible' order by match_score desc, discovered_at desc limit 5`),
    pool.query(`select id, ts, type, level, title, body, url, simulated from events order by id desc limit 8`),
  ]);
  const [pipe, markets, days, elig] = await Promise.all([
    pool.query(`select count(*) filter (where status in ('draft','preparing','awaiting_approval','approved'))::int ready,
                       count(*) filter (where status in ('submitting','submitted'))::int submitted,
                       count(*) filter (where status in ('assessment','interview'))::int progressing,
                       count(*) filter (where status = 'offer')::int offers,
                       count(*) filter (where status in ('rejected','withdrawn'))::int closed from applications`),
    pool.query(`select coalesce(country,'OTHER') c, count(*)::int n from jobs where listing_status = 'open' group by 1`),
    pool.query(`select to_char(d, 'DD Mon') label, coalesce(n, 0)::int value from generate_series(current_date - 13, current_date, interval '1 day') d
                left join (select date_trunc('day', discovered_at)::date as dd, count(*) n from jobs where listing_status <> 'hidden' group by 1) x on x.dd = d::date order by d`),
    pool.query(`select count(*) filter (where eligibility = 'eligible')::int e, count(*) filter (where eligibility in ('potentially_eligible','manual_verification'))::int p, count(*)::int t from jobs where listing_status = 'open'`),
  ]);
  const P = pipe.rows[0];
  const M = Object.fromEntries(markets.rows.map((r) => [r.c, r.n]));
  const E = elig.rows[0];
  const s = st.rows[0] ?? {};
  const hbAge = s.worker_heartbeat_at ? (Date.now() - new Date(s.worker_heartbeat_at).getTime()) / 1000 : Infinity;
  const workerOk = hbAge < Number(process.env.HEARTBEAT_STALE_SEC ?? 1500);
  const label = s.emergency_stop ? "Emergency stopped" : !workerOk ? "Agent not running" : s.status === "running" ? "Running" : "Paused";
  const color = s.emergency_stop || !workerOk ? "var(--bad)" : s.status === "running" ? "var(--good)" : "var(--warn)";
  const k = stats.rows[0];

  return (
    <div className="space-y-4">
      <SearchBox action="/search" placeholder="Search jobs, applications, emails, activity…" />
      <section className="card p-4 gradient-hero">
        <div className="flex items-center gap-2">
          <span className="relative flex w-3 h-3">
            {label === "Running" && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: color }} />}
            <span className="relative inline-flex w-3 h-3 rounded-full" style={{ background: color }} />
          </span>
          <h1 className="text-xl font-bold">{label}</h1>
          <span className="ml-auto text-xs text-muted">last run {timeAgo(s.worker_heartbeat_at)}</span>
        </div>
        <p className="text-sm text-muted mt-2 min-h-5">{s.current_activity ?? (s.last_cycle_at ? `Idle — last search cycle ${timeAgo(s.last_cycle_at)}` : "Idle")}</p>
        <div className="mt-4"><ControlButtons status={s.status} emergency={s.emergency_stop} /></div>
      </section>

      <TodoList />

      <GoalCard />

      <WeeklyCard compact />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Found today", k.today, "/jobs?sort=new", "🔎"], ["Open opportunities", k.open, "/jobs", "💼"],
          ["To decide / going ahead", k.prepared, "/applications", "🚀"], ["Submitted", k.submitted, "/applications?tab=submitted", "📨"],
        ].map(([l, v, h, ic]) => (
          <Link key={l as string} href={h as string} className="card p-3.5">
            <p className="text-lg">{ic as string}</p>
            <p className="text-2xl font-bold tabular-nums"><CountUp value={v as number} /></p>
            <p className="text-xs text-muted font-semibold">{l as string}</p>
          </Link>
        ))}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-bold text-lg">Your progress</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold text-muted mb-2">APPLICATIONS PIPELINE</p>
            <Donut sub="applications" segments={[
              { label: "To decide / going ahead", value: P.ready, color: PALETTE.blue },
              { label: "Submitted", value: P.submitted, color: PALETTE.violet },
              { label: "Tests & interviews", value: P.progressing, color: PALETTE.amber },
              { label: "Offers", value: P.offers, color: PALETTE.green },
              { label: "Not progressing", value: P.closed, color: PALETTE.red },
            ]} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted mb-2">OPEN JOBS BY MARKET</p>
            <Donut sub="open jobs" segments={[
              ...shown.map((c, i) => ({ label: c === "UK" ? "UK" : countryName(c), value: M[c] ?? 0, color: [PALETTE.blue, PALETTE.violet, PALETTE.teal, PALETTE.amber][i] })),
              { label: "Remote/other", value: Object.entries(M).filter(([c]) => !shown.includes(c)).reduce((n, [, v]) => n + Number(v), 0), color: PALETTE.grey },
            ]} />
          </div>
        </div>
        <div className="space-y-2.5">
          <Progress label="Eligible for you" right={`${E.e} of ${E.t}`} value={E.e} max={E.t} color="var(--good)" />
          <Progress label="Eligible or worth checking" right={`${E.e + E.p} of ${E.t}`} value={E.e + E.p} max={E.t} color="var(--warn)" />
          <Progress label="Applications submitted of those prepared" right={`${P.submitted + P.progressing + P.offers} of ${P.ready + P.submitted + P.progressing + P.offers}`} value={P.submitted + P.progressing + P.offers} max={P.ready + P.submitted + P.progressing + P.offers} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted mb-2">NEW JOBS FOUND — LAST 14 DAYS</p>
          <Bars data={days.rows} />
        </div>
      </section>


      <section>
        <div className="flex items-baseline justify-between mb-2"><h2 className="font-bold">Top matches</h2><Link href="/jobs" className="text-sm text-accent font-semibold">All jobs</Link></div>
        <div className="space-y-2">
          {top.rows.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="card p-3 flex items-center gap-3">
              <Score value={j.match_score} />
              <div className="min-w-0 flex-1"><p className="font-semibold truncate">{j.title}</p><p className="text-sm text-muted truncate">{j.employer} · {j.location}</p></div>
              <EligChip status={j.eligibility} />
            </Link>
          ))}
          {top.rowCount === 0 && <p className="text-sm text-muted">No matches yet — the first search cycle runs automatically.</p>}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2"><h2 className="font-bold">Recent activity</h2><Link href="/activity" className="text-sm text-accent font-semibold">All activity</Link></div>
        <LiveFeed initial={JSON.parse(JSON.stringify(events.rows))} limit={8} />
      </section>
    </div>
  );
}
