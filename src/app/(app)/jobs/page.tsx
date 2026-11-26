import Link from "next/link";
import { LimitsNote } from "@/components/Limits";
import { CompareToggle } from "@/components/Compare";
import { pool } from "@/db";
import { loadPersona, persona, homeCitySql, marketOptions } from "@/lib/persona";
import { PageHeader, Score, EligChip, CATEGORY, ELIG, fmtDate, timeAgo } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { ListControls } from "@/components/ListControls";
import { chance, CHANCE_FLAGS_SQL } from "@/lib/chance";
import { ChanceChip } from "@/components/Chance";
import { unanswered } from "@/lib/written";

type SP = Promise<Record<string, string | undefined>>;

export default async function Jobs({ searchParams }: { searchParams: SP }) {
  await loadPersona();
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const where: string[] = ["not j.dismissed"];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (sp.q) add(`(j.title ilike ? or j.employer ilike ? or j.location ilike ?)`, `%${sp.q}%`);
  if (sp.category) add(`j.category = ?`, sp.category);
  if (sp.country) add(`j.country = ?`, sp.country);
  if (sp.elig === "can") where.push(`j.eligibility <> 'ineligible'`);
  else if (sp.elig && sp.elig !== "any") add(`j.eligibility = ?`, sp.elig);
  else if (!sp.elig) where.push(`j.eligibility <> 'ineligible'`);
  where.push(sp.status === "all" ? `j.listing_status <> 'hidden'` : sp.status === "closed" ? `j.listing_status = 'closed'` : `j.listing_status = 'open'`);
  if (sp.starred) where.push(`j.starred`);
  if (sp.london) where.push(homeCitySql());
  if (sp.closing === "7" || sp.closing === "30") add(`j.deadline between now() and now() + (? || ' days')::interval`, sp.closing);
  if (sp.closing === "has") where.push(`j.deadline is not null`);
  if (sp.closing === "none") where.push(`j.deadline is null`);
  if (sp.match) add(`j.match_score >= ?`, Number(sp.match) || 0);
  if (sp.found) add(`j.discovered_at > now() - (? || ' days')::interval`, sp.found);
  if (sp.salary) where.push(`j.salary is not null`);
  if (sp.prepared === "yes") where.push(`exists (select 1 from applications a where a.job_id = j.id)`);
  if (sp.prepared === "no") where.push(`not exists (select 1 from applications a where a.job_id = j.id)`);
  if (sp.source === "board") where.push(`s.kind not in ('reed','jooble','adzuna','careerjet')`);
  else if (sp.source) add(`s.kind = ?`, sp.source);
  const ORDER: Record<string, string> = {
    score: "j.match_score desc, j.discovered_at desc", score_asc: "j.match_score asc", new: "j.discovered_at desc", old: "j.discovered_at asc",
    deadline: "j.deadline asc nulls last", deadline_desc: "j.deadline desc nulls last", employer: "lower(j.employer) asc, j.match_score desc",
    title: "lower(j.title) asc", verified: "j.last_verified_at desc nulls last", country: "j.country asc, j.match_score desc",
  };
  const order = ORDER[sp.sort ?? "score"] ?? ORDER.score;
  const r = await pool.query(
    `select j.id, j.title, j.employer, j.location, j.country, j.category, j.match_score, j.eligibility, j.deadline, j.salary, j.discovered_at, j.last_verified_at, j.listing_status, j.starred, count(*) over()::int as n_all,
            ${CHANCE_FLAGS_SQL} as description, j.missing_evidence, s.kind as source_kind, a.id as app_id, a.status, a.answers, a.missing_info, a.written, a.form_questions
     from jobs j left join sources s on s.id = j.source_id left join applications a on a.job_id = j.id where ${where.join(" and ")} order by ${order} limit 500`, args);
  // Chance of getting each one (worked out from flags found in the database, not whole adverts)
  let rows = r.rows.map((j) => ({ ...j, ch: chance({ ...j, missing_info: j.missing_info ?? j.missing_evidence, unanswered: j.app_id ? unanswered(j).length : null }) }));
  if (sp.chance) rows = rows.filter((j) => sp.chance === "strong" ? j.ch.pct >= 18 : sp.chance === "possible" ? j.ch.pct >= 8 && j.ch.pct < 18 : j.ch.pct < 8);
  if (sp.sort === "chance") rows.sort((x, y) => y.ch.pct - x.ch.pct || (y.match_score ?? 0) - (x.match_score ?? 0));
  const matched = sp.chance ? rows.length : r.rows[0]?.n_all ?? 0;
  const total = (await pool.query(`select count(*)::int n from jobs where not dismissed and listing_status = 'open' and eligibility <> 'ineligible'`)).rows[0].n;

  return (
    <div>
      <PageHeader title="Jobs" subtitle={`${matched} opportunities${matched > 500 ? " (top 500 listed)" : ""}`} right={<div className="flex gap-2"><Link href={`/map${Object.keys(sp).length ? `?${new URLSearchParams(sp)}` : ""}`} className="btn btn-ghost !text-sm">🗺️ Map</Link><Link href="/jobs/new" className="btn btn-primary !text-sm">+ Add</Link></div>} />
      <section className="card p-3 mb-3">
        <div className="flex h-3 rounded-full overflow-hidden">
          {(["eligible", "potentially_eligible", "manual_verification", "ineligible"] as const).map((k) => {
            const n = rows.filter((j) => j.eligibility === k).length;
            return n ? <div key={k} className="bar-grow" style={{ width: `${(n / Math.max(rows.length, 1)) * 100}%`, background: ELIG[k].color }} title={`${ELIG[k].label}: ${n}`} /> : null;
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
          {(["eligible", "potentially_eligible", "manual_verification", "ineligible"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: ELIG[k].color }} />{ELIG[k].label} <b className="tabular-nums"><CountUp value={rows.filter((j) => j.eligibility === k).length} /></b></span>
          ))}
        </div>
      </section>
      <div className="mb-3"><LimitsNote topic="jobs" max={2} /></div>
      <ListControls action="/jobs" params={sp} placeholder="Search title, employer, location" count={matched} total={total} shown={r.rowCount ?? 0}
        sorts={[["score", "Best match"], ["chance", "Best chance of getting it"], ["score_asc", "Lowest match"], ["new", "Newest found"], ["old", "Oldest found"], ["deadline", "Deadline: soonest"],
          ["deadline_desc", "Deadline: latest"], ["employer", "Employer A–Z"], ["title", "Job title A–Z"], ["verified", "Recently verified"], ["country", "Country"]]}
        filters={[
          { name: "category", label: "Type", options: Object.entries(CATEGORY) },
          { name: "country", label: "Country", options: marketOptions() },
          ...(persona().home.city ? [{ name: "london", label: "Location", options: [["1", `${persona().home.city} only`]] as [string, string][] }] : []),
          { name: "elig", label: "Eligibility", all: "Can apply (default)", options: [["any", "Everything, incl. ineligible"], ...Object.entries(ELIG).map(([k, v]) => [k, v.label] as [string, string])] },
          { name: "chance", label: "Chance of getting it", options: [["strong", "Good or strong (18%+)"], ["possible", "Possible (8–17%)"], ["long", "Long shot (under 8%)"]] },
          { name: "match", label: "Match", options: [["80", "80%+"], ["60", "60%+"], ["40", "40%+"]] },
          { name: "closing", label: "Deadline", options: [["7", "Closes within 7 days"], ["30", "Closes within 30 days"], ["has", "Has a deadline"], ["none", "No deadline"]] },
          { name: "found", label: "Found", options: [["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]] },
          { name: "status", label: "Listing", all: "Open (default)", options: [["closed", "Closed"], ["all", "Open + closed"]] },
          { name: "prepared", label: "Application", options: [["yes", "Prepared"], ["no", "Not prepared"]] },
          { name: "source", label: "Found on", options: [["board", "Employer job pages"], ["reed", "Reed"], ["jooble", "Jooble"]] },
          { name: "salary", label: "Pay", options: [["1", "Shows pay"]] },
          { name: "starred", label: "Starred", options: [["1", "Starred only"]] },
        ]} />
      <div className="space-y-2">
        {rows.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="card p-3 flex gap-3 items-start">
            <Score value={j.match_score} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2"><p className="font-semibold leading-snug flex-1">{j.starred && "★ "}{j.title}</p><CompareToggle jobId={j.id} label={j.employer} /></div>
              <p className="text-sm text-muted truncate">{j.employer} · {j.location ?? j.country}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <EligChip status={j.eligibility} />
                <ChanceChip c={j.ch} />
                <span className="chip">{CATEGORY[j.category] ?? j.category}</span>
                {j.salary && <span className="chip">{j.salary}</span>}
                {j.deadline && <span className="chip" style={{ color: "var(--warn)" }}>Closes {fmtDate(j.deadline)}</span>}
                {j.listing_status === "closed" && <span className="chip" style={{ color: "var(--bad)" }}>Closed</span>}
                <span className="chip text-muted">verified {timeAgo(j.last_verified_at)}</span>
              </div>
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No jobs match these filters.</p>}
      </div>
    </div>
  );
}
