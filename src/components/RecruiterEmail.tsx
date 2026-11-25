import { pool } from "@/db";
import { findContacts } from "@/lib/contacts";
import { persona } from "@/lib/persona";
import { emailRecruiter } from "@/app/actions";

/** Published recruiter contacts for this application, and an email you can send as well as (or instead of) the form. */
export async function RecruiterEmail({ app, flash }: { app: { id: string; title: string; employer: string; description?: string | null; status: string; cv_markdown?: string | null; notes?: string | null }; flash?: string }) {
  const [{ contacts, named }, det, inbox] = await Promise.all([
    findContacts(app),
    pool.query(`select value from settings where key = 'applicationDetails'`).then((r) => r.rows[0]?.value ?? {}),
    pool.query(`select 1 from settings where key = 'emailImap'`).then((r) => !!r.rowCount),
  ]);
  const P = persona();
  let sentBefore: { to: string; at: string } | null = null;
  try { sentBefore = JSON.parse(app.notes ?? "{}").recruiterEmail ?? null; } catch { /* old note */ }
  const me = [det.firstName, det.lastName].filter(Boolean).join(" ");
  const applied = !["awaiting_approval", "approved", "draft", "preparing"].includes(app.status);
  const first = contacts[0];
  const hello = first?.name ? `Dear ${first.name.split(" ")[0]},` : "Dear Hiring Team,";
  const body = `${hello}

${applied ? `I recently applied for the ${app.title} role at ${app.employer}` : `I'm applying for the ${app.title} role at ${app.employer}`} and wanted to introduce myself. I'm ${P.degreeSubject ? `a ${P.degreeSubject} ${P.fieldName === "engineering" ? "Engineering " : ""}student` : "a student"}${P.university ? ` at ${P.university}` : ""}.

[Write one or two sentences in your own words: why this role and company interest you.]

${applied ? "I'd be grateful to know if there's anything else you need from me." : "I've attached my CV and would be glad to answer any questions."}

Kind regards,
${me || "[Your name]"}${det.phone ? `\n${det.phone}` : ""}`;
  const subject = `${applied ? "Application" : "Applying"}: ${app.title}${me ? ` – ${me}` : ""}`;
  const li = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${app.employer} recruiter`)}`;

  return (
    <div className="space-y-3 text-sm">
      {flash === "sent" && <p style={{ color: "var(--good)" }}>✓ Sent from your job inbox. Replies will appear in Emails.</p>}
      {flash === "failed" && <p style={{ color: "var(--bad)" }}>Couldn&apos;t send. Check your job inbox connection in Settings, or use “Open in my Mail app”.</p>}
      {flash === "invalid" && <p style={{ color: "var(--bad)" }}>Pick a contact and write a subject and a message first.</p>}
      {sentBefore && <p className="text-muted">✉️ You emailed {sentBefore.to} on {new Date(sentBefore.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</p>}

      {contacts.length === 0 ? (
        <div className="space-y-2">
          <p>No recruiter email is published for this job{named.length ? `, but the advert names ${named.join(", ")}` : ""}. I never guess addresses: guessed emails bounce or reach the wrong person.</p>
          <a href={li} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !text-sm">Find {named[0] ?? `${app.employer}'s recruiters`} on LinkedIn ↗</a>
          <p className="text-xs text-muted">Tip: a short LinkedIn message to the recruiter after applying works well. If they reply by email, their address appears here automatically.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {contacts.map((c) => (
              <li key={c.email} className="flex items-center gap-2">
                <span className="chip !py-0.5">{c.source === "advert" ? "📄 Advert" : "📧 Emailed you"}</span>
                <span className="min-w-0 flex-1 truncate"><b>{c.name ?? c.email}</b>{c.name && <span className="text-muted"> · {c.email}</span>}</span>
              </li>
            ))}
          </ul>
          {contacts.some((c) => c.note?.startsWith("The advert says to apply by email")) && <p className="text-xs" style={{ color: "var(--warn)" }}>This advert asks for applications by email, so the email can be your application.</p>}
          <form action={emailRecruiter.bind(null, app.id)} className="space-y-2">
            <label className="block"><span className="text-xs text-muted font-semibold">To</span>
              <select name="to" className="input mt-1" defaultValue={first.email}>{contacts.map((c) => <option key={c.email} value={c.email}>{c.name ? `${c.name} <${c.email}>` : c.email}</option>)}</select></label>
            <label className="block"><span className="text-xs text-muted font-semibold">Subject</span><input name="subject" defaultValue={subject} className="input mt-1" required minLength={3} /></label>
            <label className="block"><span className="text-xs text-muted font-semibold">Message (edit the bracketed line in your own words)</span>
              <textarea name="text" rows={12} defaultValue={body} className="input mt-1 font-sans" required minLength={20} /></label>
            {app.cv_markdown && <label className="flex items-center gap-2"><input type="checkbox" name="attachCv" defaultChecked={!applied} className="w-4 h-4" /> Attach my tailored CV (PDF)</label>}
            {!applied && <label className="flex items-center gap-2"><input type="checkbox" name="asApplication" className="w-4 h-4" /> This email is my application (mark it as sent)</label>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!inbox}>✉️ Send from my job inbox</button>
              <a href={`mailto:${first.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="btn btn-ghost">Open in my Mail app</a>
            </div>
            {!inbox && <p className="text-xs text-muted">Connect your job inbox in Settings to send from here, or use your Mail app (attach the CV from “Your tailored CV” → Download).</p>}
            <p className="text-xs text-muted">Nothing is sent until you tap Send. You choose: the form, this email, or both.</p>
          </form>
        </>
      )}
    </div>
  );
}
