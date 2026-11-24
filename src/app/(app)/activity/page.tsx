import { pool } from "@/db";
import { LiveFeed } from "@/components/LiveFeed";
import { PageHeader } from "@/components/ui";
import { ListControls } from "@/components/ListControls";
import { Bars, Progress } from "@/components/charts";

const GROUPS: Record<string, string[]> = {
  needs: ["approval_requested", "deadline_approaching", "interview_detected", "employer_response", "application_failed", "info_needed", "daily_summary"],
  applications: ["cv_started", "cv_completed", "cover_letter_completed", "application_opened", "application_prepared", "approval_requested", "application_approved", "application_submitted", "submission_confirmed", "application_failed"],
  employers: ["interview_detected", "employer_response", "submission_confirmed"],
  searching: ["search_started", "employer_checked", "job_found", "job_verified", "job_closed", "deadline_changed", "eligibility_checked", "search_completed"],
  system: ["system_error", "agent_control", "source_failed", "retry_scheduled", "security", "test_notification"],
};

export default async function Activity({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const term = (sp.q ?? "").trim();
  const where: string[] = ["true"], args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (term) add(`(title ilike ? or body ilike ?)`, `%${term}%`);
  if (sp.level) add(`level = ?`, sp.level);
  if (sp.kind && GROUPS[sp.kind]) add(`type = any(?)`, GROUPS[sp.kind]);
  if (sp.when) add(`ts > now() - (? || ' hours')::interval`, sp.when);
  if (sp.importance) add(`importance = any(?)`, sp.importance === "urgent" ? ["urgent"] : ["important", "urgent"]);
  if (sp.notified === "yes") where.push(`exists (select 1 from push_deliveries d where d.event_id = events.id and d.status = 'sent')`);
  const order = sp.sort === "old" ? "id asc" : "id desc";
  const r = await pool.query(`select id, ts, type, level, title, body, url, simulated, count(*) over()::int as n_all from events where ${where.join(" and ")} order by ${order} limit 300`, args);
  const matched = r.rows[0]?.n_all ?? 0;
  const total = (await pool.query(`select count(*)::int n from events`)).rows[0].n;
  const filtered = Object.keys(sp).some((k) => k !== "q" && !(k === "sort" && sp.sort === "new"));
  const days = (await pool.query(`select to_char(d, 'DD Mon') label, coalesce(n, 0)::int value from generate_series(current_date - 13, current_date, interval '1 day') d
     left join (select date_trunc('day', ts)::date as dd, count(*) n from events group by 1) x on x.dd = d::date order by d`)).rows;
  const lv = (await pool.query(`select count(*) filter (where level = 'success')::int ok, count(*) filter (where level = 'error')::int err, count(*)::int t from events where ts > now() - interval '7 days'`)).rows[0];
  return (
    <div>
      <PageHeader title="Activity" subtitle="Every real action the agent takes, in order." />
      <section className="card p-4 mb-3 space-y-3">
        <p className="text-xs font-semibold text-muted">AGENT ACTIONS — LAST 14 DAYS</p>
        <Bars data={days} color="var(--accent)" />
        <Progress label="Successful actions this week" right={`${lv.ok} of ${lv.t}`} value={lv.ok} max={lv.t} color="var(--good)" />
        <Progress label="Errors this week" right={`${lv.err}`} value={lv.err} max={Math.max(lv.t, 1)} color="var(--bad)" height={6} />
      </section>
      <ListControls action="/activity" params={sp} placeholder="Search activity (employer, role, “interview”…)" count={matched} total={total} shown={r.rowCount ?? 0}
        sorts={[["new", "Newest first"], ["old", "Oldest first"]]}
        filters={[
          { name: "kind", label: "About", options: [["needs", "Things that need you"], ["applications", "Applications"], ["employers", "Employer replies"], ["searching", "Searching"], ["system", "System & errors"]] },
          { name: "level", label: "Result", options: [["success", "Successes"], ["info", "Info"], ["warning", "Retries & warnings"], ["error", "Failures"]] },
          { name: "when", label: "When", options: [["1", "Last hour"], ["24", "Last 24 hours"], ["168", "Last 7 days"], ["720", "Last 30 days"]] },
          { name: "importance", label: "Importance", options: [["important", "Important + urgent"], ["urgent", "Urgent only"]] },
          { name: "notified", label: "Notification", options: [["yes", "Sent to your phone"]] },
        ]} />
      {filtered && <p className="text-xs text-muted mb-2">Live updates pause while sorting or filtering. Clear filters to see new activity as it happens.</p>}
      <LiveFeed key={JSON.stringify(sp)} initial={JSON.parse(JSON.stringify(r.rows))} filter={term || undefined} live={!filtered} />
    </div>
  );
}
