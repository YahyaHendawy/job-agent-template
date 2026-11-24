import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/db";
import { requireUser, clientInfo } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { sendReply, replyTemplate } from "@/lib/mailer";
import { getDetails } from "@/lib/details";
import { fmtTime } from "@/components/ui";

const LABEL: Record<string, string> = { interview: "Interview invitation", assessment: "Assessment", offer: "Offer", rejection: "Not progressing", received: "Application received", verification: "Verify your email", recruiter: "Recruiter email", other: "Email" };

async function send(id: string, f: FormData) {
  "use server";
  const u = await requireUser();
  const body = String(f.get("body") ?? "").trim();
  if (body.length < 10) redirect(`/emails/${id}?error=empty`);
  if (/\n-\s*\n/.test(`${body}\n`) && /available at the following times/i.test(body)) redirect(`/emails/${id}?error=times`);
  const e = (await pool.query(`select * from emails where id = $1`, [id])).rows[0];
  if (!e?.from_address) redirect(`/emails/${id}?error=noaddr`);
  const d = await getDetails();
  try {
    await sendReply({ to: e.from_address, subject: e.subject ?? "", text: body, fromName: [d.firstName, d.lastName].filter(Boolean).join(" ") || undefined, inReplyTo: e.message_id?.includes("@") ? e.message_id : null });
  } catch {
    redirect(`/emails/${id}?error=send`);
  }
  await pool.query(`update emails set handled_at = now() where id = $1`, [id]);
  await audit("email_reply_sent", { to: e.from_address, subject: e.subject }, u.id, (await clientInfo()).ip);
  await emit({ type: "employer_response", level: "success", importance: "all", title: `Reply sent to ${e.from_name || e.from_address}`, body: `Re: ${e.subject}`, applicationId: e.application_id, push: false });
  revalidatePath("/");
  redirect(`/emails/${id}?sent=1`);
}

async function done(id: string) {
  "use server";
  await requireUser();
  await pool.query(`update emails set handled_at = now() where id = $1`, [id]);
  revalidatePath("/");
  redirect("/");
}

export default async function EmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; error?: string; mode?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const e = (await pool.query(`select e.*, j.title, j.employer, a.id as app_id from emails e left join applications a on a.id = e.application_id left join jobs j on j.id = a.job_id where e.id = $1`, [id])).rows[0];
  if (!e) notFound();
  const d = await getDetails();
  const feedback = sp.mode === "feedback";
  const template = replyTemplate(feedback ? "feedback" : e.category, { firstName: d.firstName ?? "", lastName: d.lastName, role: e.title, employer: e.employer, phone: d.phone });
  const canReply = feedback || !["received", "rejection", "verification", "other"].includes(e.category);
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent font-semibold">← Home</Link>
      <section className="card p-4 space-y-2">
        <span className="chip">{LABEL[e.category] ?? e.category}</span>
        <h1 className="text-lg font-bold leading-snug">{e.subject}</h1>
        <p className="text-sm text-muted">{e.from_name ? `${e.from_name} · ` : ""}{e.from_address} · {fmtTime(e.received_at)}</p>
        {e.app_id && <p className="text-sm">For: <Link href={`/applications/${e.app_id}`} className="text-accent underline">{e.title} — {e.employer}</Link></p>}
        {e.snippet && <p className="text-sm rounded-xl p-3" style={{ background: "var(--surface-2)" }}>{e.snippet}…</p>}
        <div className="flex gap-2 flex-wrap">
          <a href={e.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !text-sm">Open full email in Gmail ↗</a>
          {!e.handled_at && <form action={done.bind(null, e.id)}><button className="btn btn-ghost !text-sm">✓ Mark done</button></form>}
        </div>
      </section>

      {sp.sent && <p className="card p-3 text-sm" style={{ color: "var(--good)" }}>✓ Reply sent from your job inbox. It's in Gmail's Sent folder.</p>}
      {sp.error === "times" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Add your available times (the lines starting with “-”) before sending.</p>}
      {sp.error === "send" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Couldn't send. Check Settings → Job inbox is connected, then try again.</p>}
      {sp.error === "empty" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>The reply is empty.</p>}

      {canReply && !sp.sent && (
        <section className="card p-4 space-y-2">
          <h2 className="font-bold">Reply</h2>
          <p className="text-xs text-muted">A polite starting point. Edit it so it's yours, then tap Send. Nothing is sent until you do.</p>
          <form action={send.bind(null, e.id)} className="space-y-2">
            <p className="text-sm text-muted">To: {e.from_address}</p>
            <textarea name="body" defaultValue={template} rows={14} className="input !text-[15px] leading-relaxed" />
            <button className="btn btn-primary w-full !py-3">Send reply</button>
          </form>
        </section>
      )}
    </div>
  );
}
