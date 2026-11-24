import Link from "next/link";
import { revalidatePath } from "next/cache";
import { pool } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/events";
import { PageHeader, timeAgo } from "@/components/ui";
import { ConnectAutofill } from "@/components/ConnectAutofill";

async function revoke(id: string) {
  "use server";
  const u = await requireUser();
  await pool.query(`update api_tokens set revoked_at = now() where id = $1 and user_id = $2`, [id, u.id]);
  await audit("autofill_revoked", { id }, u.id);
  revalidatePath("/settings/autofill");
}

export default async function AutofillPage() {
  const u = await requireUser();
  const tokens = await pool.query(`select id, label, created_at, last_used_at from api_tokens where user_id = $1 and revoked_at is null order by created_at desc`, [u.id]);
  return (
    <div className="space-y-4">
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Safari autofill" subtitle="One click fills application forms on your Mac. It never submits for you." />
      <section className="card p-4"><ConnectAutofill /></section>
      <section className="card p-4 text-sm space-y-1.5">
        <h2 className="font-bold mb-1">What it does</h2>
        <p>• Fills name, contact, education, right-to-work and diversity (“Prefer not to say”) answers, and attaches your tailored CV.</p>
        <p>• Highlights personal questions in blue for you to write in your own words, with facts from your CV beside them.</p>
        <p>• You press Submit (and any CAPTCHA). When the confirmation page appears, it records the submission here automatically.</p>
        <p className="text-muted">Works on Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee and Breezy forms.</p>
      </section>
      <section className="card p-4">
        <h2 className="font-bold mb-2">Connected browsers</h2>
        <ul className="text-sm divide-y divide-line">
          {tokens.rows.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">{t.label} · last used {timeAgo(t.last_used_at)}</span>
              <form action={revoke.bind(null, t.id)}><button className="text-xs font-semibold" style={{ color: "var(--bad)" }}>Disconnect</button></form>
            </li>
          ))}
          {tokens.rowCount === 0 && <li className="py-2 text-muted">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
