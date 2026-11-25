import Link from "next/link";
import { CompareToggle } from "@/components/Compare";
import { notFound } from "next/navigation";
import { pool } from "@/db";
import { Score, EligChip, CATEGORY, fmtDate, timeAgo } from "@/components/ui";
import { prepareApplicationAction, toggleJobFlag } from "@/app/actions";
import { ChanceView } from "@/components/Chance";
import { chance } from "@/lib/chance";
import { loadPersona } from "@/lib/persona";

export default async function Job({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadPersona();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await pool.query(
    `select j.*, s.kind as source_kind, s.employer as source_name, a.id as app_id, a.status as app_status
     from jobs j left join sources s on s.id = j.source_id left join applications a on a.job_id = j.id where j.id = $1`, [id]);
  const j = r.rows[0];
  if (!j) notFound();
  const stale = !j.last_verified_at || Date.now() - new Date(j.last_verified_at).getTime() > 48 * 3600_000;

  return (
    <div className="space-y-4">
      <Link href="/jobs" className="text-sm text-accent font-semibold">← Jobs</Link>
      <div className="card p-4">
        <div className="flex gap-3">
          <Score value={j.match_score} />
          <div className="min-w-0">
            <div className="flex items-start gap-2"><h1 className="text-xl font-bold leading-snug flex-1">{j.title}</h1><CompareToggle jobId={j.id} label={j.employer} big /></div>
            <p className="text-muted">{j.employer} · {j.location ?? j.country}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <EligChip status={j.eligibility} />
          <span className="chip">{CATEGORY[j.category] ?? j.category}</span>
          {j.employment_type && <span className="chip">{j.employment_type}</span>}
          {j.salary && <span className="chip">{j.salary}</span>}
          <span className="chip" style={{ color: j.listing_status === "open" && !stale ? "var(--good)" : "var(--warn)" }}>
            {j.listing_status === "closed" ? `Closed ${timeAgo(j.closed_at)}` : stale ? "Not re-verified in 48h" : `Open · verified ${timeAgo(j.last_verified_at)}`}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
          <dt className="text-muted">Deadline</dt><dd>{j.deadline ? fmtDate(j.deadline) : "Not published"}</dd>
          <dt className="text-muted">Start / duration</dt><dd>{[j.start_date, j.duration].filter(Boolean).join(" · ") || "Not stated"}</dd>
          <dt className="text-muted">Discovered</dt><dd>{fmtDate(j.discovered_at)}</dd>
          <dt className="text-muted">Source</dt><dd>{j.source_name ?? "—"} ({j.source_kind ?? "?"})</dd>
        </dl>
        <div className="flex flex-wrap gap-2 mt-4">
          {j.app_id ? (
            <Link href={`/applications/${j.app_id}`} className="btn btn-primary">Open application ({j.app_status.replace(/_/g, " ")})</Link>
          ) : (
            <form action={prepareApplicationAction.bind(null, j.id)}><button className="btn btn-primary">Prepare application</button></form>
          )}
          {j.application_url && <a href={j.application_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Employer page ↗</a>}
          <form action={toggleJobFlag.bind(null, j.id, "starred")}><button className="btn btn-ghost">{j.starred ? "Unstar" : "Star"}</button></form>
          <form action={toggleJobFlag.bind(null, j.id, "dismissed")}><button className="btn btn-ghost">{j.dismissed ? "Restore" : "Dismiss"}</button></form>
        </div>
      </div>

      <section className="card p-4">
        <h2 className="font-bold mb-3">Chance of getting it</h2>
        <ChanceView c={chance({ ...j, status: j.app_status, missing_info: j.missing_evidence })} />
      </section>

      <section className="card p-4">
        <h2 className="font-bold mb-2">Eligibility reasoning</h2>
        <ul className="space-y-1.5 text-sm">{(j.eligibility_reasons as string[]).map((x, i) => <li key={i}>• {x}</li>)}</ul>
        {(j.missing_evidence as string[]).length > 0 && (
          <>
            <h3 className="font-semibold mt-3 mb-1 text-sm">Missing evidence</h3>
            <ul className="space-y-1 text-sm text-muted">{(j.missing_evidence as string[]).map((x, i) => <li key={i}>• {x}</li>)}</ul>
          </>
        )}
      </section>
      <section className="card p-4">
        <h2 className="font-bold mb-2">Why it matches</h2>
        <ul className="space-y-1 text-sm">{(j.match_reasons as string[]).map((x, i) => <li key={i}>• {x}</li>)}</ul>
      </section>
      <section className="card p-4">
        <h2 className="font-bold mb-2">Job description</h2>
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{j.description || "Full description not retrieved for this listing — open the employer page."}</div>
      </section>
    </div>
  );
}
