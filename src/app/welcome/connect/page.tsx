import Link from "next/link";
import { pool } from "@/db";
import { requireUser } from "@/lib/auth";
import { loadPersona, COUNTRIES } from "@/lib/persona";
import { joobleKeyName } from "@/connectors";
import { appUrl, vapidKeys, secret } from "@/lib/keys";
import { retryScheduler } from "../actions";

export const dynamic = "force-dynamic";

type Item = { id: string; title: string; required: boolean; done: boolean; status: string; steps: React.ReactNode[]; action?: React.ReactNode };

const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  <a href={href} target="_blank" rel="noreferrer" className="text-accent underline font-semibold">{children}</a>;

/** "Link everything": one card per service, each verified live, phone-friendly steps. */
export default async function Connect({ searchParams }: { searchParams: Promise<{ new?: string; sched?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const P = await loadPersona(true);
  const q = async (sql: string) => (await pool.query(sql).catch(() => ({ rows: [] as any[] }))).rows;
  const [cron, st, keysRow, inbox, push, tokens, srcs, jobs] = await Promise.all([
    q(`select active from cron.job where jobname = 'job-agent-tick'`),
    q(`select worker_heartbeat_at from agent_state where id = 1`),
    q(`select value from settings where key = 'apiKeys'`),
    q(`select value->>'user' as user from settings where key = 'emailImap'`),
    q(`select count(*)::int n from push_subscriptions`),
    q(`select count(*)::int n from api_tokens where revoked_at is null`),
    q(`select count(*)::int n, count(*) filter (where enabled)::int on_ from sources`),
    q(`select count(*)::int n from jobs`),
  ]);
  const keys = keysRow[0]?.value ?? {};
  const draftExists = !!(await q(`select 1 from settings where key = 'onboarding' and value ? 'study'`)).length;
  const beat = st[0]?.worker_heartbeat_at ? new Date(st[0].worker_heartbeat_at) : null;
  const mins = beat ? Math.round((Date.now() - beat.getTime()) / 60000) : null;
  const url = appUrl() ?? "this app's address";
  const uk = P.markets.some((m) => m.code === "UK");
  const joobles = P.markets.filter((m) => COUNTRIES[m.code]?.jooble);
  const anyBoardKey = (uk && !!keys.reed) || joobles.some((m) => keys[joobleKeyName(m.code)]);

  const items: Item[] = [
    { id: "app", title: "Your app and database", required: true, done: !!P.completed && !!secret("SECRETS_KEY"), status: P.completed ? `Online at ${url}. Your answers are saved.` : "Answer the setup questions first.",
      steps: [P.completed ? "Done when you deployed with the button and finished the questions." : <Link key="w" href="/welcome?step=1" className="text-accent underline">Answer the setup questions</Link>,
        !secret("SECRETS_KEY") ? "Missing database connection details: in Vercel → your project → Storage, check Supabase is connected, then Redeploy." : "Secrets were created for you automatically. You never need to type them."] },
    { id: "scheduler", title: "Runs every 10 minutes, even with your phone off", required: true, done: !!cron[0]?.active && mins !== null && mins < 30,
      status: cron[0]?.active ? (mins === null ? "Scheduler created. Waiting for its first run (up to 10 minutes)." : `Last ran ${mins} min ago.`) : "Not set up yet.",
      steps: ["This was set up automatically in your free Supabase database when the app was built.", "If it says “not set up”, tap the button. It takes a few seconds.", "Refresh this page after 10 minutes to see “Last ran … min ago”."],
      action: <form action={retryScheduler}><button className="btn btn-ghost w-full">Set up / repair the scheduler</button></form> },
    { id: "keys", title: "Free job-site keys (more jobs)", required: false, done: anyBoardKey,
      status: `${srcs[0]?.on_ ?? 0} of ${srcs[0]?.n ?? 0} sources on · ${jobs[0]?.n ?? 0} jobs found so far`,
      steps: [
        "Employer job boards already work with no key. These add thousands of listings and cost nothing.",
        ...(uk ? [<span key="reed">Reed (UK): open <A href="https://www.reed.co.uk/developers/jobseeker">reed.co.uk/developers/jobseeker</A>, create a free account, fill the short form (website: {url}), copy the key.</span>] : []),
        ...joobles.map((m) => <span key={m.code}>Jooble {COUNTRIES[m.code].name}: open <A href={`https://${COUNTRIES[m.code].jooble}.jooble.org/api/about`}>{COUNTRIES[m.code].jooble}.jooble.org/api/about</A>, fill the form (Position: Student; Website: {url}). The key arrives by email.</span>),
        <span key="paste">Paste each key in <Link href="/settings/sites" className="text-accent underline">Settings → Job sites</Link>. Searches switch on by themselves.</span>,
      ] },
    { id: "inbox", title: "Job inbox (spots interviews and replies)", required: false, done: !!inbox[0]?.user, status: inbox[0]?.user ? `Connected: ${inbox[0].user}` : "Not connected",
      steps: ["Use the Gmail address you apply with. A new free Gmail just for jobs is best.",
        <span key="2sv">Turn on 2-Step Verification: <A href="https://myaccount.google.com/signinoptions/twosv">myaccount.google.com/signinoptions/twosv</A></span>,
        <span key="ap">Create an app password named “Job Agent”: <A href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</A>. Copy the 16-letter code.</span>,
        <span key="c">Paste it in <Link href="/settings/email" className="text-accent underline">Settings → Job inbox</Link>. You type it into your own app; it&apos;s stored encrypted and never shown again.</span>] },
    { id: "phone", title: "Phone app and notifications", required: true, done: (push[0]?.n ?? 0) > 0, status: push[0]?.n ? `${push[0].n} device(s) get notifications` : "No device yet",
      steps: ["iPhone: open this app in Safari → tap Share (square with arrow) → Add to Home Screen → Add.", "Open Job Agent from the new Home Screen icon (notifications only work from the icon on iPhone).",
        <span key="n">Go to <Link href="/settings" className="text-accent underline">Settings</Link> → Enable notifications → Allow, then tap Send test.</span>,
        "Android: open in Chrome → menu ⋮ → Add to Home screen / Install app, then the same Settings steps.",
        ...(vapidKeys() ? [] : ["⚠️ Push keys are missing: check Supabase is connected in Vercel, then Redeploy."])] },
    { id: "mac", title: "Mac app + Safari autofill (optional, needs a Mac)", required: false, done: (tokens[0]?.n ?? 0) > 0, status: tokens[0]?.n ? "Autofill connected" : "Optional: skip if you only use your phone",
      steps: ["Honestly: this part can't be done on a phone. It needs a Mac with Xcode (free), because Apple only lets you install your own Safari extension when you build it yourself.",
        "With a free Apple ID (“Personal Team”) the app works on your own Mac, but Apple makes it expire after 7 days: rebuild it in Xcode (one click) when it stops. A paid Apple Developer account ($99/year) removes that limit, but you don't need it.",
        "Steps: get the code from your GitHub copy → open mac-app/Job Agent.xcodeproj in Xcode → Signing: choose your Personal Team → Run → Safari → Settings → Extensions → turn on Job Agent Autofill → then Settings → Safari autofill in this app to connect.",
        "Without it, everything else still works: each application has an Apply Kit you can copy from on your phone."] },
    { id: "backup", title: "Weekly encrypted backup (optional)", required: false, done: !!process.env.BLOB_READ_WRITE_TOKEN, status: process.env.BLOB_READ_WRITE_TOKEN ? "On" : "Off",
      steps: [<span key="b">In <A href="https://vercel.com/dashboard">vercel.com</A> → your project → Storage → Create → Blob (free) → Connect to project, then Deployments → ⋯ → Redeploy.</span>] },
  ];
  const req = items.filter((i) => i.required), doneReq = req.filter((i) => i.done).length;
  const all = req.every((i) => i.done);

  return (
    <main className="min-h-dvh p-4 safe-top max-w-lg mx-auto pb-16 space-y-4">
      {sp.new && <p className="card p-3 text-sm" style={{ color: "var(--good)" }}>🎉 Saved! Your first search has started. Now link the pieces below, one at a time.</p>}
      {sp.sched && <p className="card p-3 text-sm">{sp.sched}</p>}
      <h1 className="text-2xl font-bold">{all ? "You're fully set up ✅" : "Link everything"}</h1>
      <p className="text-sm text-muted">{doneReq} of {req.length} essentials done. Everything here is free. Each card checks itself, so come back and refresh.</p>
      <div className="h-2 rounded-full bg-[var(--surface-2)]"><div className="h-2 rounded-full" style={{ width: `${(doneReq / req.length) * 100}%`, background: "var(--good)" }} /></div>
      {items.map((it, i) => (
        <details key={it.id} className="card p-4" open={!it.done && (i === items.findIndex((x) => !x.done))}>
          <summary className="flex items-center gap-3 cursor-pointer list-none">
            <span className="text-xl">{it.done ? "✅" : it.required ? "⬜️" : "➖"}</span>
            <span className="flex-1"><span className="font-bold block">{it.title}</span><span className="text-xs text-muted">{it.status}</span></span>
            {!it.required && <span className="chip">optional</span>}
          </summary>
          <ol className="list-decimal pl-5 space-y-2 text-sm mt-3">{it.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
          {it.action && <div className="mt-3">{it.action}</div>}
        </details>
      ))}
      <Link href="/" className="btn btn-primary w-full !py-3 !text-base">{all ? "Open my Job Agent →" : "Go to the app (finish the rest later)"}</Link>
      <p className="text-center text-xs text-muted">Come back any time: Settings → Setup checklist.{draftExists && <> <Link href="/welcome?step=1" className="underline">Change my answers</Link></>}</p>
    </main>
  );
}
