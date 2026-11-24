import Link from "next/link";
import { pool } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, fmtDate } from "@/components/ui";
import { Progress } from "@/components/charts";
import { loadPersona, COUNTRIES } from "@/lib/persona";
import { joobleKeyName } from "@/connectors";

type Entry = { date: string; what: string; where: string; details?: string; status: "done" | "waiting_on_you" | "optional"; next?: string };

const COLOR = { done: "var(--good)", waiting_on_you: "var(--warn)", optional: "var(--muted)" } as const;
const LABEL = { done: "Done", waiting_on_you: "Needs you", optional: "Optional" } as const;

/** Everything set up or submitted on the owner's behalf, plus live status of what's still needed. */
export default async function SetupLog() {
  await requireUser();
  const P = await loadPersona();
  const [log, det, keys, tokens, push] = await Promise.all([
    pool.query(`select value from settings where key = 'setupLog'`),
    pool.query(`select value from settings where key = 'applicationDetails'`),
    pool.query(`select value from settings where key = 'apiKeys'`),
    pool.query(`select count(*)::int n from api_tokens where revoked_at is null`),
    pool.query(`select count(*)::int n from push_subscriptions`),
  ]);
  const entries: Entry[] = log.rows[0]?.value ?? [];
  const d = det.rows[0]?.value ?? {};
  const k = keys.rows[0]?.value ?? {};
  const missingDetails = [...(d.addressChoice === "area-only" ? [] : ["addressLine1"]), "postcode", ...(P.visa.preset === "uk_student" ? ["visaExpiry"] : []), "earliestStartSummer", "latestEndSummer", "drivingLicence", "unspentConvictions"].filter((x) => !d[x]);
  const live: Entry[] = [
    { date: "", what: "Application details", where: "Settings → Application details", status: missingDetails.length ? "waiting_on_you" : "done", next: missingDetails.length ? `${missingDetails.length} item(s) still empty` : undefined },
    ...P.markets.filter((m) => COUNTRIES[m.code]?.jooble).map((m): Entry => ({ date: "", what: `Jooble ${COUNTRIES[m.code].name} key`, where: "Settings → Job sites", status: k[joobleKeyName(m.code)] ? "done" : "optional", next: k[joobleKeyName(m.code)] ? undefined : `Free: request it at ${COUNTRIES[m.code].jooble}.jooble.org/api/about, then paste it in Settings → Job sites` })),
    ...(P.markets.some((m) => m.code === "UK") ? [{ date: "", what: "Reed API key (UK)", where: "Settings → Job sites", status: k.reed ? "done" : "optional", next: k.reed ? undefined : "Free: reed.co.uk/developers/jobseeker, then paste it in Settings → Job sites" } as Entry] : []),
    { date: "", what: "Adzuna App ID + Key (UK)", where: "Settings → Job sites", status: k.adzunaId && k.adzunaKey ? "done" : "optional", next: k.adzunaId ? undefined : "Skipped: Adzuna needs a paid plan beyond 25 test calls" },
    { date: "", what: "Careerjet key", where: "Settings → Job sites", status: k.careerjet ? "done" : "optional" },
    { date: "", what: "Safari autofill connected", where: "Settings → Safari autofill", status: tokens.rows[0].n ? "done" : "waiting_on_you" },
    { date: "", what: "Notifications on a device", where: "Settings → Notifications", status: push.rows[0].n ? "done" : "waiting_on_you", next: push.rows[0].n ? `${push.rows[0].n} device(s)` : undefined },
  ];
  const Row = ({ e }: { e: Entry }) => (
    <li className="py-2.5">
      <div className="flex items-start gap-2">
        <span className="chip shrink-0" style={{ color: COLOR[e.status] }}>{LABEL[e.status]}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{e.what}</p>
          <p className="text-xs text-muted">{[e.date && fmtDate(e.date), e.where].filter(Boolean).join(" · ")}</p>
          {e.details && <p className="text-xs mt-0.5">{e.details}</p>}
          {e.next && <p className="text-xs mt-0.5" style={{ color: e.status === "done" ? "var(--muted)" : "var(--warn)" }}>{e.next}</p>}
        </div>
      </div>
    </li>
  );
  return (
    <div className="space-y-4">
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Setup log" subtitle="Everything set up or submitted for you, and what still needs you" />
      <section className="card p-4">
        <Progress label="Setup complete" right={`${live.filter((e) => e.status !== "waiting_on_you").length} of ${live.length}`} value={live.filter((e) => e.status !== "waiting_on_you").length} max={live.length} color="var(--good)" height={10} />
      </section>
      <section className="card p-4">
        <h2 className="font-bold mb-1">Status now</h2>
        <ul className="divide-y divide-line">{live.map((e, i) => <Row key={i} e={e} />)}</ul>
      </section>
      <section className="card p-4">
        <h2 className="font-bold mb-1">What was done for you</h2>
        <ul className="divide-y divide-line">{[...entries].reverse().map((e, i) => <Row key={i} e={e} />)}</ul>
        {!entries.length && <p className="text-sm text-muted">Nothing recorded yet.</p>}
      </section>
      <p className="text-xs text-muted">No passwords are ever stored here. Account passwords live in your Passwords app (iCloud Keychain).</p>
    </div>
  );
}
