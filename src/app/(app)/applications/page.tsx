import Link from "next/link";
import { CompareToggle } from "@/components/Compare";
import { pool } from "@/db";
import { loadPersona, persona, homeCitySql, marketOptions } from "@/lib/persona";
import { PageHeader, APP_STATUS, timeAgo, CATEGORY, ELIG } from "@/components/ui";
import { ListControls } from "@/components/ListControls";
import { Stepper, Donut, PALETTE } from "@/components/charts";
import { verdict } from "@/lib/verdict";
import { readNotes } from "@/lib/goahead";
import { VerdictView } from "@/components/Verdict";
import { ChanceChip } from "@/components/Chance";
import { chance } from "@/lib/chance";
import { applicantsModel } from "@/lib/applicants";
import { ApplicantsCounter } from "@/components/Applicants";
import { unanswered } from "@/lib/written";

const TABS: [string, string, string[]][] = [
  ["approval", "To decide", ["awaiting_approval"]],
  ["going", "Going ahead", ["approved"]],
  ["submitted", "Submitted", ["submitting", "submitted"]],
  ["progress", "Tests & interviews", ["assessment", "interview"]],
  ["offers", "Offers", ["offer"]],
  ["notdoing", "Not doing", ["declined", "withdrawn"]],
  ["closed", "Rejected", ["rejected"]],
  ["drafts", "Being prepared", ["draft", "preparing", "failed"]],
];

export default async function Applications({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await loadPersona();
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const tab = sp.tab ?? "approval";
  const term = (sp.q ?? "").trim();
  const counts = await pool.query(`select status, count(*)::int n from applications group by status`);
  const c = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  const cur = TABS.find((t) => t.at(0) === tab) ?? TABS[0];
  const where: string[] = [], args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (term) add(`(j.title ilike ? or j.employer ilike ? or j.location ilike ?)`, `%${term}%`);
  else add(`a.status = any(?)`, cur[2]);
  if (sp.category) add(`j.category = ?`, sp.category);
  if (sp.country) add(`j.country = ?`, sp.country);
  if (sp.london) where.push(homeCitySql());
  if (sp.match) add(`j.match_score >= ?`, Number(sp.match) || 0);
  if (sp.elig) add(`j.eligibility = ?`, sp.elig);
  if (sp.closing === "7" || sp.closing === "30") add(`j.deadline between now() and now() + (? || ' days')::interval`, sp.closing);
  if (sp.closing === "has") where.push(`j.deadline is not null`);
  if (sp.answers === "yes") where.push(`jsonb_array_length(coalesce(a.written, '[]'::jsonb)) > 0`);
  if (sp.answers === "no") where.push(`jsonb_array_length(coalesce(a.written, '[]'::jsonb)) = 0`);
  const ORDER: Record<string, string> = {
    smart: "(j.deadline is not null and j.deadline > now()) desc, j.deadline asc nulls last, j.match_score desc",
    match: "j.match_score desc", match_asc: "j.match_score asc", deadline: "j.deadline asc nulls last", deadline_desc: "j.deadline desc nulls last",
    new: "a.created_at desc", old: "a.created_at asc", updated: "a.updated_at desc", employer: "lower(j.employer) asc", title: "lower(j.title) asc",
    verdict: "j.match_score desc", chance: "j.match_score desc",
  };
  const defaultSort = ["approval", "going", "drafts"].includes(cur[0]) && !term ? "smart" : "updated";
  const sortKey = sp.sort && ORDER[sp.sort] ? sp.sort : defaultSort;
  const r = await pool.query(
    `select a.id, a.status, a.updated_at, a.created_at, j.id as job_id, j.title, j.employer, j.deadline, j.match_score, j.category, j.location, j.country, j.match_reasons,
            j.eligibility, j.eligibility_reasons, a.missing_info, j.salary, a.notes, a.answers, a.written, a.form_questions, j.description, j.discovered_at, s.kind as source_kind
     from applications a join jobs j on j.id = a.job_id left join sources s on s.id = j.source_id where ${where.join(" and ")} order by ${ORDER[sortKey]}`, args);
  // Recommendation (✅/👍/🤔/⚠️) is worked out per application, so it is filtered and sorted here.
  const RANK: Record<string, number> = { good: 0, ok: 1, warn: 2, bad: 3 };
  let rows = r.rows.map((a) => ({ ...a, v: verdict(a), ch: chance({ ...a, unanswered: unanswered(a).length }) }));
  if (sp.verdict) rows = rows.filter((a) => a.v.tone === sp.verdict);
  if (sp.chance) rows = rows.filter((a) => sp.chance === "strong" ? a.ch.pct >= 18 : sp.chance === "possible" ? a.ch.pct >= 8 && a.ch.pct < 18 : a.ch.pct < 8);
  if (sortKey === "chance") rows.sort((x, y) => y.ch.pct - x.ch.pct || (y.match_score ?? 0) - (x.match_score ?? 0));
  if (sortKey === "verdict") rows.sort((x, y) => RANK[x.v.tone] - RANK[y.v.tone] || (y.match_score ?? 0) - (x.match_score ?? 0));
  const daysLeft = (d: string | null) => (d ? Math.ceil((Date.parse(d) - Date.now()) / 86400000) : null);
  return (
    <div>
      <PageHeader title="Applications" subtitle="Nothing is submitted without your approval." />
      <ListControls action="/applications" params={{ ...sp, sort: sortKey }} keep={["tab"]} placeholder="Search applications by role or employer…" count={rows.length} total={term ? counts.rows.reduce((n, x) => n + x.n, 0) : cur[2].reduce((n, s) => n + (c[s] ?? 0), 0)}
        sorts={[["smart", "Smart: closing soonest, then best"], ["verdict", "Recommendation (✅ first)"], ["chance", "Best chance of getting it"], ["match", "Best match"], ["match_asc", "Lowest match"],
          ["deadline", "Deadline: soonest"], ["deadline_desc", "Deadline: latest"], ["new", "Newest prepared"], ["old", "Oldest prepared"], ["updated", "Recently updated"],
          ["employer", "Employer A–Z"], ["title", "Job title A–Z"]]}
        filters={[
          { name: "chance", label: "Chance of getting it", options: [["strong", "Good or strong (18%+)"], ["possible", "Possible (8–17%)"], ["long", "Long shot (under 8%)"]] },
          { name: "verdict", label: "Recommendation", options: [["good", "✅ Apply"], ["ok", "👍 Worth applying"], ["warn", "🤔 Your call"], ["bad", "⚠️ Probably skip"]] },
          { name: "category", label: "Type", options: Object.entries(CATEGORY) },
          { name: "country", label: "Country", options: marketOptions() },
          ...(persona().home.city ? [{ name: "london", label: "Location", options: [["1", `${persona().home.city} only`]] as [string, string][] }] : []),
          { name: "match", label: "Match", options: [["80", "80%+"], ["60", "60%+"], ["40", "40%+"]] },
          { name: "closing", label: "Deadline", options: [["7", "Closes within 7 days"], ["30", "Closes within 30 days"], ["has", "Has a deadline"]] },
          { name: "elig", label: "Eligibility", options: Object.entries(ELIG).filter(([k]) => k !== "ineligible").map(([k, v]) => [k, v.label] as [string, string]) },
          { name: "answers", label: "Your answers", options: [["yes", "Some written"], ["no", "None written yet"]] },
        ]} />
      {!term && (
        <section className="card p-4 mb-3">
          <Donut size={110} thickness={14} sub="total" segments={[
            { label: "To decide", value: (c.awaiting_approval ?? 0) + (c.draft ?? 0) + (c.preparing ?? 0), color: PALETTE.blue },
            { label: "Going ahead", value: c.approved ?? 0, color: PALETTE.teal },
            { label: "Submitted", value: (c.submitted ?? 0) + (c.submitting ?? 0), color: PALETTE.violet },
            { label: "Tests & interviews", value: (c.assessment ?? 0) + (c.interview ?? 0), color: PALETTE.amber },
            { label: "Offers", value: c.offer ?? 0, color: PALETTE.green },
            { label: "Not doing", value: (c.declined ?? 0) + (c.withdrawn ?? 0), color: "var(--muted)" },
            { label: "Rejected", value: c.rejected ?? 0, color: PALETTE.red },
          ]} />
        </section>
      )}
      {term && <p className="text-sm text-muted mb-2">Searching all stages for “{term}” · <a href="/applications" className="text-accent">clear</a></p>}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4" hidden={!!term}>
        {TABS.map(([k, l, st]) => {
          const n = st.reduce((s, x) => s + (c[x] ?? 0), 0);
          return (
            <Link key={k} href={`/applications?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([p]) => p !== "tab" && p !== "q")), tab: k })}`} className={`btn shrink-0 !py-1.5 !text-sm ${k === cur[0] ? "btn-primary" : "btn-ghost"}`}>
              {l}{n ? ` · ${n}` : ""}
            </Link>
          );
        })}
      </div>
      {!term && cur[0] === "approval" && sortKey === "smart" && rows.length > 1 && (
        <p className="text-sm text-muted mb-2">👆 Sorted for you: closing soonest first, then best match. Open the top one and choose ✅ Yes or 👎 No; the next one opens by itself.</p>
      )}
      <div className="space-y-2">
        {rows.map((a) => (
          <Link key={a.id} href={`/applications/${a.id}`} className="card p-3 block space-y-2">
            <div>
              <div className="flex items-start gap-2">
                <p className="font-semibold flex-1">{a.title}</p>
                {a.match_score != null && <span className="chip shrink-0">{a.match_score}% match</span>}
                <CompareToggle jobId={a.job_id} label={a.employer} />
              </div>
              <p className="text-sm text-muted">
                {a.employer} · {APP_STATUS[a.status]}
                {a.category === "placement" && " · placement year"}
                {(() => { const d = daysLeft(a.deadline); return d == null ? <> · updated {timeAgo(a.updated_at)}</> : d < 0 ? " · deadline passed"
                  : <> · <span style={{ color: d <= 7 ? "var(--bad)" : undefined, fontWeight: d <= 7 ? 600 : undefined }}>{d === 0 ? "closes today" : d === 1 ? "closes tomorrow" : `closes in ${d} days`}</span></>; })()}
              </p>
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1.5"><ChanceChip c={a.ch} /><ApplicantsCounter m={applicantsModel(a)} compact /></div>
            {["awaiting_approval", "draft", "preparing", "approved"].includes(a.status) ? <VerdictView v={a.v} compact />
              : a.status === "declined" ? <p className="text-xs text-muted">👎 {readNotes(a.notes).decision?.reasonText ?? "Not doing"} · decided {timeAgo(readNotes(a.notes).decision?.at ?? a.updated_at)}</p>
              : <Stepper status={a.status} compact />}
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">{Object.keys(sp).some((k) => !["tab", "sort"].includes(k)) ? "Nothing matches these filters." : "Nothing here yet."}</p>}
      </div>
    </div>
  );
}
