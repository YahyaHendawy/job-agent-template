import Link from "next/link";
import { LimitsNote } from "@/components/Limits";
import { COUNTRIES, loadPersona } from "@/lib/persona";
import { isHomeCity } from "@/matching";
import { pool } from "@/db";
import { PageHeader, APP_STATUS, CATEGORY, ELIG, fmtDate, timeAgo } from "@/components/ui";
import { verdict } from "@/lib/verdict";
import { chance } from "@/lib/chance";
import { ChanceChip } from "@/components/Chance";
import { halalCheck } from "@/lib/halal";
import { questionsFor } from "@/lib/written";
import { decideYes, decideNo } from "@/app/actions";
import { CompareRemove, CompareSync } from "@/components/Compare";

const COUNTRY = new Proxy({} as Record<string, string>, { get: (_t, c: string) => (COUNTRIES[c] ? `${COUNTRIES[c].flag} ${c === "UK" ? "UK" : COUNTRIES[c].name}` : undefined) });
const TONE: Record<string, string> = { good: "var(--good)", ok: "var(--accent)", warn: "var(--warn)", bad: "var(--bad)" };
const inHome = (loc: string | null) => !!loc && isHomeCity(loc);

type Cell = { text: React.ReactNode; score?: number | null; note?: string };
type Row = { label: string; cells: Cell[]; best?: "high" | "low" };

/** Side-by-side comparison of up to 4 jobs / applications. Best value in each row gets a ★. */
export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await loadPersona();
  const { ids = "" } = await searchParams;
  const list = ids.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
  if (list.length < 2) {
    return (
      <div><PageHeader title="Compare" subtitle="Pick 2 to 4 jobs or applications" />
        <div className="card p-4 text-sm space-y-2">
          <p>Tap <b>⇄ Compare</b> on any job or application (in the lists or at the top of its page). When you've picked at least 2, tap <b>Compare →</b> at the bottom of the screen.</p>
          <div className="flex gap-2"><Link href="/applications" className="btn btn-primary !text-sm">Pick from Applications</Link><Link href="/jobs" className="btn btn-ghost !text-sm">Pick from Jobs</Link></div>
        </div>
      </div>
    );
  }
  const r = await pool.query(
    `select j.id as job_id, j.title, j.employer, j.location, j.country, j.category, j.match_score, j.match_reasons, j.eligibility, j.eligibility_reasons,
            j.salary, j.deadline, j.start_date, j.duration, j.employment_type, j.description, j.listing_status, j.discovered_at, j.last_verified_at,
            a.id as app_id, a.status, a.missing_info, a.answers, a.written, a.form_questions, s.kind as source_kind
     from jobs j left join applications a on a.job_id = j.id left join sources s on s.id = j.source_id where j.id = any($1)`, [list]);
  const items = list.map((id) => r.rows.find((x) => x.job_id === id)).filter(Boolean) as any[];
  const data = items.map((j) => {
    const v = verdict(j);
    const reqs: any[] = j.answers ?? [];
    const written = new Set((j.written ?? []).map((w: any) => w.key));
    const toWrite = questionsFor(j).filter((q) => !written.has(q.key)).length;
    const days = j.deadline ? Math.ceil((Date.parse(j.deadline) - Date.now()) / 86400000) : null;
    const ch = chance({ ...j, unanswered: j.app_id ? toWrite : null });
    return { j, v, ch, reqs, toWrite, minutes: toWrite * 5 + 10, days, halal: halalCheck(j) };
  });
  const RANK: Record<string, number> = { good: 3, ok: 2, warn: 1, bad: 0 };
  const ELIG_RANK: Record<string, number> = { eligible: 3, potentially_eligible: 2, manual_verification: 1, ineligible: 0 };

  const rows: Row[] = [
    { label: "Recommendation", best: "high", cells: data.map((d) => ({ text: <span className="font-semibold" style={{ color: TONE[d.v.tone] }}>{d.v.call}</span>, score: RANK[d.v.tone] })) },
    { label: "Chance of getting it", best: "high", cells: data.map((d) => ({ text: <ChanceChip c={d.ch} />, score: d.ch.pct })) },
    { label: "Match", best: "high", cells: data.map((d) => ({ text: d.j.match_score != null ? `${d.j.match_score}%` : "—", score: d.j.match_score })) },
    { label: "Your visa", best: "high", cells: data.map((d) => ({ text: <span style={{ color: ELIG[d.j.eligibility]?.color }}>{ELIG[d.j.eligibility]?.label ?? "—"}</span>, score: ELIG_RANK[d.j.eligibility] })) },
    { label: "Halal", best: "high", cells: data.map((d) => ({ text: d.halal.blocked ? "☪️ Not halal" : d.halal.warnings.length ? `☪️ ${d.halal.warnings[0].replace("Halal check: ", "")}` : "✓ No concerns", score: d.halal.blocked ? 0 : d.halal.warnings.length ? 1 : 2 })) },
    { label: "Type", cells: data.map((d) => ({ text: CATEGORY[d.j.category] ?? d.j.category })) },
    { label: "Location", best: "high", cells: data.map((d) => ({ text: `${d.j.location ?? "—"}${d.j.country && COUNTRY[d.j.country] ? ` · ${COUNTRY[d.j.country]}` : ""}`, score: inHome(d.j.location) ? 1 : 0 })) },
    { label: "Pay", cells: data.map((d) => ({ text: d.j.salary ?? <i className="text-muted">Not stated</i> })) },
    { label: "Hours / contract", cells: data.map((d) => ({ text: d.j.employment_type ?? <i className="text-muted">Not stated</i> })) },
    { label: "Start / length", cells: data.map((d) => ({ text: [d.j.start_date, d.j.duration].filter(Boolean).join(" · ") || <i className="text-muted">Not stated</i> })) },
    { label: "Deadline", cells: data.map((d) => ({ text: d.j.deadline ? <span style={{ color: d.days! <= 7 ? "var(--bad)" : undefined }}>{fmtDate(d.j.deadline)} ({d.days! < 0 ? "passed" : d.days === 0 ? "today" : `${d.days} days`})</span> : <i className="text-muted">None given</i> })) },
    { label: "Requirements on your CV", best: "high", cells: data.map((d) => {
      const ok = d.reqs.filter((q) => q.evidence === "verified").length;
      return { text: d.reqs.length ? `${ok} of ${d.reqs.length}` : "—", score: d.reqs.length ? ok / d.reqs.length : null };
    }) },
    { label: "Your time to apply", best: "low", cells: data.map((d) => ({ text: d.j.app_id ? `~${d.minutes} min (${d.toWrite} answer${d.toWrite === 1 ? "" : "s"})` : "Not prepared yet", score: d.j.app_id ? d.minutes : null })) },
    { label: "Status", cells: data.map((d) => ({ text: d.j.app_id ? APP_STATUS[d.j.status] ?? d.j.status : "Job only" })) },
    { label: "Advert", cells: data.map((d) => ({ text: d.j.listing_status === "closed" ? <span style={{ color: "var(--bad)" }}>Closed</span> : `Open · checked ${timeAgo(d.j.last_verified_at)}` })) },
  ];
  for (const row of rows) {
    if (!row.best) continue;
    const scores = row.cells.map((c) => c.score).filter((s): s is number => typeof s === "number");
    if (scores.length < 2 || new Set(scores).size === 1) continue;
    const target = row.best === "high" ? Math.max(...scores) : Math.min(...scores);
    row.cells.forEach((c) => { if (c.score === target) c.note = "★"; });
  }
  const stars = data.map((_, i) => rows.filter((row) => row.cells[i].note === "★").length);
  const top = Math.max(...stars);

  return (
    <div>
      <CompareSync items={data.map((d) => ({ id: d.j.job_id, label: d.j.employer }))} />
      <PageHeader title="Compare" subtitle={`${data.length} side by side · ★ = best in that row`} />
      <div className="card p-0 overflow-x-auto">
        <table className="text-sm border-collapse w-full" style={{ minWidth: 140 + data.length * 210 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 text-left p-3 align-bottom w-36" style={{ background: "var(--surface)" }} />
              {data.map((d, i) => (
                <th key={d.j.job_id} className="text-left p-3 align-top font-normal border-l border-line" style={{ width: 210 }}>
                  {stars[i] === top && top > 0 && <p className="text-xs font-bold mb-1" style={{ color: "var(--good)" }}>🏆 Most ★ ({stars[i]})</p>}
                  <Link href={d.j.app_id ? `/applications/${d.j.app_id}` : `/jobs/${d.j.job_id}`} className="font-bold leading-snug hover:underline block">{d.j.title}</Link>
                  <p className="text-muted">{d.j.employer}</p>
                  <div className="mt-1"><CompareRemove jobId={d.j.job_id} ids={data.map((x) => x.j.job_id)} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>{row.label}</th>
                {row.cells.map((c, i) => (
                  <td key={i} className="p-3 align-top border-l border-line" style={c.note ? { background: "color-mix(in srgb, var(--good) 10%, transparent)" } : undefined}>
                    {c.text}{c.note && <span className="ml-1" style={{ color: "var(--good)" }}>★</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>Why apply</th>
              {data.map((d) => <td key={d.j.job_id} className="p-3 align-top border-l border-line text-xs"><ul className="space-y-1">{d.v.pros.map((p, i) => <li key={i}>✅ {p}</li>)}</ul></td>)}
            </tr>
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>Why you might not</th>
              {data.map((d) => <td key={d.j.job_id} className="p-3 align-top border-l border-line text-xs"><ul className="space-y-1">{d.v.cons.length ? d.v.cons.map((c, i) => <li key={i}>⚠️ {c}</li>) : <li className="text-muted">No concerns</li>}</ul></td>)}
            </tr>
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>Why you could get it</th>
              {data.map((d) => <td key={d.j.job_id} className="p-3 align-top border-l border-line text-xs"><ul className="space-y-1">{d.ch.could.length ? d.ch.could.map((c, i) => <li key={i}>👍 {c}</li>) : <li className="text-muted">Nothing stands out</li>}</ul></td>)}
            </tr>
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>Why you might not get it</th>
              {data.map((d) => <td key={d.j.job_id} className="p-3 align-top border-l border-line text-xs"><ul className="space-y-1">{d.ch.couldnt.length ? d.ch.couldnt.map((c, i) => <li key={i}>👎 {c}</li>) : <li className="text-muted">No obvious obstacles</li>}</ul></td>)}
            </tr>
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 text-left p-3 font-semibold text-muted align-top" style={{ background: "var(--surface)" }}>Decide</th>
              {data.map((d) => (
                <td key={d.j.job_id} className="p-3 align-top border-l border-line space-y-2">
                  {d.j.app_id && d.j.status === "awaiting_approval" ? (<>
                    <form action={decideYes.bind(null, d.j.app_id)}><button className="btn btn-primary w-full !py-2 !text-sm">✅ Yes, apply</button></form>
                    <form action={decideNo.bind(null, d.j.app_id)}><input type="hidden" name="reason" value="other" /><button className="btn btn-ghost w-full !py-2 !text-sm">👎 No</button></form>
                  </>) : (
                    <Link href={d.j.app_id ? `/applications/${d.j.app_id}` : `/jobs/${d.j.job_id}`} className="btn btn-ghost w-full !py-2 !text-sm">Open</Link>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Swipe sideways to see every column. Tap a title to open it in full.</p>
      <div className="mt-3"><LimitsNote topic="compare" max={2} /></div>
    </div>
  );
}
