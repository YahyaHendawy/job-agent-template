import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { requireUser, clientInfo } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { enqueue } from "@/lib/queue";
import { kickRunner } from "@/lib/kick";
import { seal } from "@/lib/secretbox";
import { testImap } from "@/worker/inbox";
import { PageHeader, timeAgo } from "@/components/ui";

async function connect(f: FormData) {
  "use server";
  const u = await requireUser();
  const user = String(f.get("user") ?? "").trim().toLowerCase();
  const pass = String(f.get("pass") ?? "").replace(/\s+/g, "");
  if (!/^[^@\s]+@gmail\.com$/.test(user) || !/^[a-z]{16}$/i.test(pass)) redirect("/settings/email?error=format");
  try { await testImap(user, pass); } catch { redirect("/settings/email?error=login"); }
  await pool.query(`insert into settings (key, value, updated_at) values ('emailImap', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ user, sealed: seal(pass), connectedAt: new Date().toISOString() })]);
  await pool.query(`delete from settings where key = 'emailState'`);
  await audit("inbox_connected", { user }, u.id, (await clientInfo()).ip);
  await emit({ type: "security", title: "Job inbox connected", body: `${user}. Checked every 10 minutes.`, push: false });
  await enqueue("check_inbox", {}, { dedupeKey: `inbox:connect:${Date.now()}` });
  kickRunner(120_000);
  revalidatePath("/", "layout");
  redirect("/settings/email?ok=1");
}

async function disconnect() {
  "use server";
  const u = await requireUser();
  await pool.query(`delete from settings where key in ('emailImap','emailState')`);
  await audit("inbox_disconnected", {}, u.id);
  revalidatePath("/settings/email");
}

export default async function EmailSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const conf = (await pool.query(`select value from settings where key = 'emailImap'`)).rows[0]?.value;
  const st = (await pool.query(`select value from settings where key = 'emailState'`)).rows[0]?.value ?? {};
  const counts = (await pool.query(`select category, count(*)::int n from emails group by 1 order by 2 desc`)).rows;
  return (
    <div className="space-y-4">
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Job inbox" subtitle="The app reads your job inbox so you never miss an interview, test or reply" />
      {sp.ok && <p className="card p-3 text-sm" style={{ color: "var(--good)" }}>Connected. The first check is running now.</p>}
      {sp.error === "format" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>That doesn't look right: use your full Gmail address and the 16-letter app password.</p>}
      {sp.error === "login" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Gmail didn't accept that app password. Create a new one and try again.</p>}

      {conf ? (
        <section className="card p-4 space-y-2 text-sm">
          <p><span className="chip" style={{ color: "var(--good)" }}>Connected</span> <b>{conf.user}</b></p>
          <p className="text-muted">Last checked {timeAgo(st.lastCheckedAt)} · {st.processed ?? 0} emails read{st.lastError ? ` · last error: ${st.lastError}` : ""}</p>
          {counts.length > 0 && <p className="text-muted">{counts.map((c) => `${c.n} ${c.category}`).join(" · ")}</p>}
          <form action={disconnect}><button className="btn btn-ghost !text-sm">Disconnect</button></form>
        </section>
      ) : (
        <section className="card p-4 space-y-3 text-sm">
          <h2 className="font-bold">Connect in 2 minutes</h2>
          <p>An <b>app password</b> is a special 16-letter code from Google that lets one app read your Gmail, without your real password. You can delete it any time.</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>On your phone or Mac, sign in to Google with the Gmail address you use for job applications (a new free one just for jobs is best).</li>
            <li>Turn on <b>2-Step Verification</b> (Google requires it for app passwords): <a className="text-accent underline" href="https://myaccount.google.com/signinoptions/twosv" target="_blank">myaccount.google.com/signinoptions/twosv</a></li>
            <li>Open <a className="text-accent underline" href="https://myaccount.google.com/apppasswords" target="_blank">myaccount.google.com/apppasswords</a>, type the name <b>Job Agent</b>, tap <b>Create</b>.</li>
            <li>Google shows a code like <code>abcd efgh ijkl mnop</code>. Copy it and paste it below.</li>
          </ol>
          <form action={connect} className="space-y-2">
            <input name="user" type="email" placeholder="you.jobs@gmail.com" className="input" autoComplete="off" />
            <input name="pass" type="password" placeholder="16-letter app password" className="input" autoComplete="off" />
            <button className="btn btn-primary w-full">Connect job inbox</button>
          </form>
          <p className="text-xs text-muted">The code is tested with Gmail, then stored encrypted. The app only reads emails and keeps a short snippet; it never sends, deletes or changes anything in your inbox.</p>
        </section>
      )}
    </div>
  );
}
