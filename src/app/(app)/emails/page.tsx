import Link from "next/link";
import { LimitsNote } from "@/components/Limits";
import { pool } from "@/db";
import { PageHeader, fmtTime } from "@/components/ui";
import { ListControls } from "@/components/ListControls";

const CAT: Record<string, string> = {
  interview: "🎤 Interview", assessment: "📝 Online test", offer: "🎉 Offer", rejection: "💪 Not this time", received: "📬 Application received",
  verification: "🔗 Confirm email", recruiter: "💬 Recruiter", other: "📧 Other",
};

/** Every email the job inbox has read, with sorting and filters. Full emails stay in Gmail. */
export default async function Emails({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const where: string[] = ["true"], args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (sp.q) add(`(e.subject ilike ? or e.from_name ilike ? or e.from_address ilike ? or e.snippet ilike ? or j.employer ilike ?)`, `%${sp.q}%`);
  if (sp.category) add(`e.category = ?`, sp.category);
  if (sp.status === "todo") where.push(`e.needs_action and e.handled_at is null`);
  if (sp.status === "done") where.push(`e.handled_at is not null`);
  if (sp.status === "info") where.push(`not e.needs_action`);
  if (sp.linked === "yes") where.push(`e.application_id is not null`);
  if (sp.linked === "no") where.push(`e.application_id is null`);
  if (sp.when) add(`e.received_at > now() - (? || ' days')::interval`, sp.when);
  const ORDER: Record<string, string> = {
    new: "e.received_at desc", old: "e.received_at asc", todo: "(e.needs_action and e.handled_at is null) desc, e.received_at desc",
    sender: "lower(coalesce(e.from_name, e.from_address)) asc", category: "e.category asc, e.received_at desc",
  };
  const r = await pool.query(
    `select e.id, e.category, e.subject, e.from_name, e.from_address, e.received_at, e.needs_action, e.handled_at, e.snippet, j.employer, j.title, count(*) over()::int as n_all
     from emails e left join applications a on a.id = e.application_id left join jobs j on j.id = a.job_id
     where ${where.join(" and ")} order by ${ORDER[sp.sort ?? "todo"] ?? ORDER.todo} limit 300`, args);
  const matched = r.rows[0]?.n_all ?? 0;
  const total = (await pool.query(`select count(*)::int n from emails`)).rows[0].n;
  const todo = r.rows.filter((e) => e.needs_action && !e.handled_at).length;

  return (
    <div>
      <PageHeader title="Emails" subtitle={`Your job inbox${todo ? ` · ${todo} need you` : ""}`} />
      <div className="mb-3"><LimitsNote topic="emails" max={1} /></div>
      <ListControls action="/emails" params={sp} placeholder="Search sender, subject, employer…" count={matched} total={total} shown={r.rowCount ?? 0}
        sorts={[["todo", "Needs you first"], ["new", "Newest"], ["old", "Oldest"], ["sender", "Sender A–Z"], ["category", "Type"]]}
        filters={[
          { name: "category", label: "Type", options: Object.entries(CAT) },
          { name: "status", label: "Status", options: [["todo", "Needs you"], ["done", "Dealt with"], ["info", "Just for info"]] },
          { name: "linked", label: "Application", options: [["yes", "Linked to an application"], ["no", "Not linked"]] },
          { name: "when", label: "Received", options: [["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]] },
        ]} />
      <div className="space-y-2">
        {r.rows.map((e) => (
          <Link key={e.id} href={`/emails/${e.id}`} className="card p-3 block">
            <div className="flex items-start gap-2">
              <p className="font-semibold flex-1 truncate">{e.subject || "(no subject)"}</p>
              {e.needs_action && !e.handled_at && <span className="chip shrink-0" style={{ color: "var(--warn)" }}>Needs you</span>}
              {e.handled_at && <span className="chip shrink-0" style={{ color: "var(--good)" }}>✓ Done</span>}
            </div>
            <p className="text-sm text-muted truncate">{e.from_name || e.from_address} · {CAT[e.category] ?? e.category} · {fmtTime(e.received_at)}</p>
            {e.employer && <p className="text-xs text-muted truncate mt-0.5">For: {e.title} · {e.employer}</p>}
          </Link>
        ))}
        {r.rowCount === 0 && <p className="text-sm text-muted">{Object.keys(sp).length ? "Nothing matches these filters." : "No job emails yet. They appear here as soon as the inbox watcher finds them."}</p>}
      </div>
    </div>
  );
}
