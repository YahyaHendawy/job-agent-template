import Link from "next/link";
import { pool } from "@/db";
import { PageHeader, Score, EligChip, APP_STATUS, fmtTime } from "@/components/ui";
import { ListControls } from "@/components/ListControls";

/** Search everything at once: jobs, applications, emails and activity. */
export default async function SearchAll({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const term = (sp.q ?? "").trim();
  const only = sp.in;
  const want = (k: string) => !only || only === k;
  const lim = (n: number) => (only ? 100 : n);
  const newest = sp.sort === "new", oldest = sp.sort === "old";
  const like = `%${term.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const none = Promise.resolve(null);
  const [jobs, apps, mail, events] = term ? await Promise.all([
    want("jobs") ? pool.query(`select id, title, employer, location, match_score, eligibility, listing_status from jobs
                where listing_status <> 'hidden' and (title ilike $1 or employer ilike $1 or location ilike $1 or description ilike $1)
                order by ${newest ? "discovered_at desc" : oldest ? "discovered_at asc" : sp.sort === "az" ? "lower(title)" : "match_score desc"} limit ${lim(15)}`, [like]) : none,
    want("applications") ? pool.query(`select a.id, a.status, j.title, j.employer from applications a join jobs j on j.id = a.job_id
                where j.title ilike $1 or j.employer ilike $1 or a.cv_markdown ilike $1
                order by ${oldest ? "a.updated_at asc" : sp.sort === "az" ? "lower(j.title)" : sp.sort === "best" ? "j.match_score desc" : "a.updated_at desc"} limit ${lim(10)}`, [like]) : none,
    want("emails") ? pool.query(`select id, category, subject, from_name, from_address, received_at, link from emails
                where subject ilike $1 or from_name ilike $1 or from_address ilike $1 or snippet ilike $1
                order by ${oldest ? "received_at asc" : sp.sort === "az" ? "lower(subject)" : "received_at desc"} limit ${lim(10)}`, [like]) : none,
    want("activity") ? pool.query(`select id, ts, title, body, url from events where title ilike $1 or body ilike $1 order by id ${oldest ? "asc" : "desc"} limit ${lim(10)}`, [like]) : none,
  ]) : [null, null, null, null];
  const total = (jobs?.rowCount ?? 0) + (apps?.rowCount ?? 0) + (mail?.rowCount ?? 0) + (events?.rowCount ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Search" subtitle="Jobs, applications, emails and activity" />
      <ListControls action="/search" params={sp} placeholder="Search everything…" count={term ? total : undefined}
        sorts={[["best", "Best match"], ["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]]}
        filters={[{ name: "in", label: "Show only", all: "Everything", options: [["jobs", "Jobs"], ["applications", "Applications"], ["emails", "Emails"], ["activity", "Activity"]] }]} />
      {term && total === 0 && <p className="text-sm text-muted">Nothing found for “{term}”.</p>}

      {jobs && jobs.rowCount! > 0 && (
        <section><h2 className="font-bold mb-2">Jobs ({jobs.rowCount})</h2><div className="space-y-2">
          {jobs.rows.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="card p-3 flex items-center gap-3">
              <Score value={j.match_score} />
              <div className="min-w-0 flex-1"><p className="font-semibold truncate">{j.title}</p><p className="text-sm text-muted truncate">{j.employer} · {j.location}{j.listing_status === "closed" ? " · closed" : ""}</p></div>
              <EligChip status={j.eligibility} />
            </Link>))}
        </div></section>
      )}
      {apps && apps.rowCount! > 0 && (
        <section><h2 className="font-bold mb-2">Applications ({apps.rowCount})</h2><div className="space-y-2">
          {apps.rows.map((a) => (
            <Link key={a.id} href={`/applications/${a.id}`} className="card p-3 block"><p className="font-semibold">{a.title}</p><p className="text-sm text-muted">{a.employer} · {APP_STATUS[a.status]}</p></Link>))}
        </div></section>
      )}
      {mail && mail.rowCount! > 0 && (
        <section><h2 className="font-bold mb-2">Emails ({mail.rowCount})</h2><div className="space-y-2">
          {mail.rows.map((e) => (
            <Link key={e.id} href={`/emails/${e.id}`} className="card p-3 block">
              <p className="font-semibold truncate">{e.subject}</p><p className="text-sm text-muted truncate">{e.from_name || e.from_address} · {e.category} · {fmtTime(e.received_at)}</p>
            </Link>))}
        </div></section>
      )}
      {events && events.rowCount! > 0 && (
        <section><h2 className="font-bold mb-2">Activity ({events.rowCount})</h2><div className="space-y-2">
          {events.rows.map((e) => (
            <Link key={e.id} href={e.url ?? "/activity"} className="card p-3 block"><p className="font-semibold text-sm">{e.title}</p>{e.body && <p className="text-xs text-muted whitespace-pre-line">{e.body}</p>}<p className="text-[11px] text-muted mt-1">{fmtTime(e.ts)}</p></Link>))}
        </div></section>
      )}
    </div>
  );
}
