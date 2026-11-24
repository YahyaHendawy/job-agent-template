import Link from "next/link";
import { stages } from "@/lib/guide";
import { setInterviewTime } from "@/app/actions";

/** Step-by-step help for the current stage of an application. */
export function StageGuide({ app, rejectionEmailId }: { app: { id: string; status: string; employer: string; notes: string | null; application_url: string | null }; rejectionEmailId?: string | null }) {
  const s = stages()[app.status];
  if (!s) return null;
  let notes: { interviewAt?: string; interviewWhere?: string } = {};
  try { notes = app.notes ? JSON.parse(app.notes) : {}; } catch {}
  const site = app.application_url ? new URL(app.application_url).origin : null;
  return (
    <section className="card p-4 space-y-3" style={{ borderColor: "var(--accent)" }}>
      <h2 className="font-bold">{s.title}</h2>
      <ol className="space-y-2 text-sm">
        {s.steps.map((step, i) => (
          <li key={i} className="flex gap-2"><span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0" style={{ background: "var(--surface-2)" }}>{i + 1}</span><span>{step}</span></li>
        ))}
      </ol>
      {app.status === "interview" && (
        <form action={setInterviewTime.bind(null, app.id)} className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
          <p className="text-sm font-semibold">Interview time</p>
          <input name="when" type="datetime-local" defaultValue={notes.interviewAt ?? ""} className="input" />
          <input name="where" defaultValue={notes.interviewWhere ?? ""} placeholder="Video link or address" className="input" />
          <div className="flex gap-2">
            <button className="btn btn-primary !text-sm">Save</button>
            {notes.interviewAt && <a href={`/api/applications/${app.id}/ics`} className="btn btn-ghost !text-sm">Add to calendar</a>}
          </div>
          <p className="text-xs text-muted">You'll get a reminder the day before and 1 hour before.</p>
        </form>
      )}
      {app.status === "interview" && site && (
        <div className="flex flex-wrap gap-1.5">
          <a className="chip !text-accent" href={site} target="_blank" rel="noopener noreferrer">{app.employer} website ↗</a>
          <a className="chip !text-accent" href={`https://www.google.com/search?q=${encodeURIComponent(app.employer + " news")}&tbm=nws`} target="_blank" rel="noopener noreferrer">Latest news ↗</a>
          <a className="chip !text-accent" href={`https://www.glassdoor.co.uk/Search/results.htm?keyword=${encodeURIComponent(app.employer + " interview")}`} target="_blank" rel="noopener noreferrer">Interview experiences ↗</a>
        </div>
      )}
      {app.status === "rejected" && rejectionEmailId && (
        <Link href={`/emails/${rejectionEmailId}?mode=feedback`} className="btn btn-primary !text-sm">Ask for feedback (email ready)</Link>
      )}
      {s.links && (
        <div className="flex flex-wrap gap-1.5">{s.links.map((l) => <a key={l.href} className="chip !text-accent" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}</div>
      )}
    </section>
  );
}
