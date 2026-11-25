import Link from "next/link";
import { pool } from "@/db";
import { PageHeader } from "@/components/ui";
import { oppOf, STATE_LABEL, daysUntil, fmtDay, type Opp } from "@/lib/opportunity";
import { addOwnJob } from "@/app/actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { considering: "var(--warn)", accepted: "var(--good)", started: "var(--accent)", finished: "var(--muted)", declined: "var(--muted)" };
function next(o: Opp) {
  const r = daysUntil(o.respondBy), s = daysUntil(o.start), e = daysUntil(o.end);
  if (o.state === "considering") return r != null ? `Decide by ${fmtDay(o.respondBy)}${r <= 2 ? " ⏰" : ""}` : "Decide: check it fits, then accept or decline";
  if (o.state === "accepted") return s != null ? (s > 0 ? `Starts in ${s} day${s > 1 ? "s" : ""} · ${fmtDay(o.start)}` : "Starts today") : "Add your start date";
  if (o.state === "started") return e != null && e >= 0 ? `In the role · ends ${fmtDay(o.end)}` : "In the role · log your hours each week";
  if (o.state === "finished") return "Finished · ask for a reference and add it to your CV";
  return "Declined";
}

/** My job: every offer and job you've got, from deciding to finishing. */
export default async function Work({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const r = await pool.query(`select a.id, a.status, a.notes, a.updated_at, j.title, j.employer, j.location from applications a join jobs j on j.id = a.job_id
     where a.status = 'offer' or a.notes like '%"opportunity"%' order by a.updated_at desc`);
  const rows = r.rows.map((a) => ({ ...a, o: oppOf(a.notes) as Opp }));
  const active = rows.filter((a) => !["declined", "finished"].includes(a.o.state));
  const past = rows.filter((a) => ["declined", "finished"].includes(a.o.state));
  const interviews = (await pool.query(`select count(*)::int n from applications where status in ('assessment','interview')`)).rows[0].n;
  const Card = ({ a }: { a: { id: string; title: string; employer: string; location: string | null; o: Opp } }) => (
    <Link href={`/work/${a.id}`} className="card p-4 block">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="font-bold leading-snug">{a.title}</p><p className="text-sm text-muted truncate">{a.employer}{a.location ? ` · ${a.location}` : ""}</p></div>
        <span className="chip shrink-0 font-semibold" style={{ color: TONE[a.o.state] }}>{STATE_LABEL[a.o.state]}</span>
      </div>
      <p className="text-sm mt-2">{next(a.o)}</p>
    </Link>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="My job" subtitle="When you get an offer, everything to manage it lives here: deciding, replying, getting ready, the job itself and finishing well." />
      {active.length ? <div className="space-y-2">{active.map((a) => <Card key={a.id} a={a} />)}</div> : (
        <section className="card p-4 space-y-2 text-sm">
          <h2 className="font-bold">No offers yet</h2>
          <p className="text-muted">When an employer emails an offer, it appears here by itself with checks against your visa, reply templates, a getting-ready checklist, an hours log and a work journal.</p>
          {interviews > 0 && <Link href="/applications?tab=progress" className="btn btn-primary !text-sm">Prepare for your {interviews} test{interviews > 1 ? "s and interviews" : " or interview"} →</Link>}
        </section>
      )}
      <section className="card p-4 space-y-3" id="add">
        <h2 className="font-bold">Got a job another way?</h2>
        <p className="text-sm text-muted">A fair, a contact or a site the app doesn&apos;t track: add it to manage it here too.</p>
        {sp.error === "own" && <p className="text-sm" style={{ color: "var(--bad)" }}>Add the employer and the job title.</p>}
        <form action={addOwnJob} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input name="employer" required placeholder="Employer *" className="input" />
          <input name="title" required placeholder="Job title *" className="input" />
          <label className="text-xs text-muted">Start date<input name="start" type="date" className="input mt-0.5" /></label>
          <button className="btn btn-primary sm:col-span-3">Add my job</button>
        </form>
      </section>
      {past.length > 0 && (
        <section>
          <p className="hud-label mb-2 px-1">Past</p>
          <div className="space-y-2">{past.map((a) => <Card key={a.id} a={a} />)}</div>
        </section>
      )}
    </div>
  );
}
