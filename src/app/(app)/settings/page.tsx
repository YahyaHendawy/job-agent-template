import { getBlockedList } from "@/lib/blocked";
import { loadPersona } from "@/lib/persona";
import { vapidKeys } from "@/lib/keys";
import { HALAL_CATEGORIES, HALAL_DEFAULTS } from "@/lib/halal";
import { freePlanHealth } from "@/lib/usage";
import { Progress } from "@/components/charts";
import { ListControls } from "@/components/ListControls";
import { pool } from "@/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { pushConfigured } from "@/lib/push";
import { getProfile } from "@/profile";
import { PageHeader, timeAgo, fmtTime } from "@/components/ui";
import { PushControls } from "@/components/PushControls";
import { SettingsSearch } from "@/components/SettingsSearch";
import { saveHalal, saveBlockedEmployers, setNotificationMode, setSearchInterval, toggleSource, revokeSession, removeDevice, logoutAction, setAutomationFlag } from "@/app/actions";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section data-settings-item className="card p-4"><h2 className="font-bold mb-3">{title}</h2>{children}</section>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const [settings, profile, sources, sessions, devices, audit] = await Promise.all([
    getSettings(), getProfile(),
    pool.query(`select id, kind, token, employer, enabled, last_checked_at, last_status, last_job_count from sources order by kind, employer`),
    pool.query(`select id, user_agent, ip, created_at, last_seen_at from sessions where revoked_at is null and expires_at > now() order by last_seen_at desc`),
    pool.query(`select id, user_agent, created_at, last_success_at, failures from push_subscriptions order by created_at desc`),
    pool.query(`select ts, action, ip from audit_log order by id desc limit 15`),
  ]);
  const blocked = await getBlockedList();
  const halal = { ...HALAL_DEFAULTS, ...((await pool.query(`select value from settings where key = 'halal'`)).rows[0]?.value ?? {}) };
  const PF = (await loadPersona(true)).filters;
  // Job sources list: search, filter and sort
  const AGG = ["reed", "adzuna", "jooble", "careerjet"];
  let srcRows = sources.rows.filter((s) => {
    if (sp.q && !`${s.employer} ${s.token} ${s.kind}`.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.kind === "board" && AGG.includes(s.kind)) return false;
    if (sp.kind && sp.kind !== "board" && s.kind !== sp.kind) return false;
    if (sp.state === "on" && !s.enabled) return false;
    if (sp.state === "off" && s.enabled) return false;
    if (sp.state === "failing" && !(s.enabled && s.last_status && s.last_status !== "ok")) return false;
    if (sp.state === "ok" && !(s.enabled && s.last_status === "ok")) return false;
    return true;
  });
  const by: Record<string, (a: any, b: any) => number> = {
    name: (a, b) => a.employer.localeCompare(b.employer),
    listings: (a, b) => (b.last_job_count ?? 0) - (a.last_job_count ?? 0),
    checked: (a, b) => +new Date(b.last_checked_at ?? 0) - +new Date(a.last_checked_at ?? 0),
    type: (a, b) => a.kind.localeCompare(b.kind) || a.employer.localeCompare(b.employer),
    problems: (a, b) => Number(b.last_status !== "ok" && b.enabled) - Number(a.last_status !== "ok" && a.enabled) || a.employer.localeCompare(b.employer),
  };
  srcRows = [...srcRows].sort(by[sp.sort ?? "type"] ?? by.type);
  const fp = await freePlanHealth();
  const pct = (a: number, b: number) => Math.round((a / b) * 100);
  const barColor = (r: number) => (r >= 0.6 ? "var(--bad)" : r >= 0.4 ? "var(--warn)" : "var(--good)");
  const mode = settings.notifications.mode;

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={`Signed in as ${me.email}`} right={<form action={logoutAction}><button className="btn btn-ghost !text-sm">Sign out</button></form>} />
      <SettingsSearch />
      <a href="/limits" data-settings-item className="card p-4 flex items-center gap-3">
        <span className="text-xl">🚧</span>
        <span className="flex-1"><b>What the app can't do</b><br /><span className="text-sm text-muted">Submit for you, write personal answers, search every site… and what to do instead</span></span>
        <span className="text-accent font-semibold">→</span>
      </a>

      <Section title="Notifications">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {([["action", "Action needed only", "Only when you must do something"], ["all", "All activity", "Every operation"], ["important", "Important only", "Approvals, submissions, deadlines, replies, errors"], ["quiet", "Quiet", "Urgent only"]] as const).map(([v, l, d]) => (
            <form key={v} action={setNotificationMode.bind(null, v)}>
              <button className={`w-full text-left rounded-xl p-3 border ${mode === v ? "border-accent bg-surface-2" : "border-line"}`}>
                <p className="font-semibold text-sm">{l}</p><p className="text-xs text-muted">{d}</p>
              </button>
            </form>
          ))}
        </div>
        <PushControls vapidKey={vapidKeys()?.publicKey ?? null} serverReady={pushConfigured()} />
        <h3 className="font-semibold text-sm mt-4 mb-1">Devices receiving notifications</h3>
        <ul className="text-sm divide-y divide-line">
          {devices.rows.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate">{describeUA(d.user_agent)} · last delivered {timeAgo(d.last_success_at)}{d.failures ? ` · ${d.failures} failures` : ""}</span>
              <form action={removeDevice.bind(null, d.id)}><button className="text-xs font-semibold" style={{ color: "var(--bad)" }}>Remove</button></form>
            </li>
          ))}
          {devices.rowCount === 0 && <li className="py-2 text-muted">No devices yet.</li>}
        </ul>
      </Section>

      <Section title="Search schedule">
        <form action={setSearchInterval} className="flex items-end gap-2">
          <label className="text-sm flex-1"><span className="text-muted font-semibold">Run a full search every (minutes)</span>
            <input name="interval" type="number" min={60} max={1440} defaultValue={settings.search.intervalMinutes} className="input mt-1" /></label>
          <button className="btn btn-primary">Save</button>
        </form>
      </Section>

      <section id="sources" data-settings-item className="card p-4 scroll-mt-4">
        <h2 className="font-bold mb-3">{`Job sources (${sources.rows.filter((s) => s.enabled).length} active)`}</h2>
        <ListControls action="/settings#sources" params={sp} placeholder="Search job sources…" count={srcRows.length} total={sources.rows.length}
          sorts={[["type", "Type"], ["name", "Name A–Z"], ["listings", "Most listings"], ["checked", "Recently checked"], ["problems", "Problems first"]]}
          filters={[
            { name: "kind", label: "Type", options: [["board", "Employer job pages"], ["reed", "Reed searches"], ["jooble", "Jooble searches"], ["careerjet", "Careerjet"], ["adzuna", "Adzuna (paid, off)"]] },
            { name: "state", label: "Status", options: [["on", "On"], ["off", "Off"], ["ok", "Working"], ["failing", "Having problems"]] },
          ]} />
        <ul className="text-sm divide-y divide-line max-h-96 overflow-y-auto">
          {srcRows.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{s.employer}{["reed", "adzuna", "jooble", "careerjet"].includes(s.kind) ? ` — ${s.token}` : ""}</p>
                <p className="text-xs text-muted">{s.kind} · {s.last_checked_at ? `checked ${timeAgo(s.last_checked_at)} · ${s.last_status === "ok" ? `${s.last_job_count} listings` : s.last_status}` : (s.enabled ? "not checked yet" : "needs API key")}</p>
              </div>
              <form action={toggleSource.bind(null, s.id)}><button className={`btn !py-1 !text-xs ${s.enabled ? "btn-ghost" : "btn-primary"}`}>{s.enabled ? "Disable" : "Enable"}</button></form>
            </li>
          ))}
        </ul>
      </section>

      <section id="free-plan" data-settings-item className="card p-4 scroll-mt-4">
        <h2 className="font-bold mb-1">Free plan 🛡️</h2>
        <p className="text-sm text-muted mb-3">Everything runs on free plans, with no card on file, so nothing can ever charge you. The agent watches its own use and searches less often if it ever gets near a limit (it acts at 60%).</p>
        <div className="space-y-3">
          <Progress label="Computing this month (Vercel, 4 h free)" value={fp.cpu.projectedMin} max={fp.cpu.limitMin} color={barColor(fp.cpu.projectedMin / fp.cpu.limitMin)}
            right={`${fp.cpu.usedMin.toFixed(1)} min used · on track for ${Math.round(fp.cpu.projectedMin)} min (${pct(fp.cpu.projectedMin, fp.cpu.limitMin)}%)`} />
          <Progress label="Running time this month (Vercel, 360 GB-h free)" value={fp.memory.projectedGbH} max={fp.memory.limitGbH} color={barColor(fp.memory.projectedGbH / fp.memory.limitGbH)}
            right={`on track for ${Math.round(fp.memory.projectedGbH)} GB-h (${pct(fp.memory.projectedGbH, fp.memory.limitGbH)}%)`} />
          <Progress label="Database (Supabase, 500 MB free)" value={fp.db.usedMb} max={fp.db.limitMb} color={barColor(fp.db.usedMb / fp.db.limitMb)}
            right={`${fp.db.usedMb.toFixed(0)} MB (${pct(fp.db.usedMb, fp.db.limitMb)}%) · cleaned nightly`} />
        </div>
        <p className="text-xs text-muted mt-3">Searching every {fp.intervalMinutes / 60} h{fp.autoSlowed ? " (slowed automatically to stay free)" : ""}. Other free services: Gmail (job inbox), Reed & Jooble (free keys), Apple push. If any of these stops, the rest keeps working.</p>
      </section>

      <section id="halal" data-settings-item className="card p-4 scroll-mt-4">
        <h2 className="font-bold mb-1">Halal filter ☪️</h2>
        <p className="text-sm text-muted mb-3">Jobs in these industries or roles are never found, shown or prepared. Islamic banks and takaful are allowed. Grey areas (for example a supermarket till that may sell alcohol) aren't blocked; they show a ☪️ warning on the job so you decide.</p>
        <form action={saveHalal} className="space-y-2">
          <label className="flex gap-2 items-start font-semibold"><input type="checkbox" name="enabled" defaultChecked={PF.halal} className="mt-1 w-4 h-4" /> Halal filter on</label>
          {HALAL_CATEGORIES.map((c) => (
            <label key={c.key} className="flex items-start gap-3 text-sm py-1">
              <input type="checkbox" name={c.key} defaultChecked={halal[c.key]} className="mt-1 w-4 h-4" />
              <span><b>{c.label}</b><br /><span className="text-muted text-xs">{c.what}</span></span>
            </label>
          ))}
          <label className="flex items-start gap-3 text-sm py-1">
            <input type="checkbox" name="flagGreyAreas" defaultChecked={halal.flagGreyAreas} className="mt-1 w-4 h-4" />
            <span><b>Warn me about grey areas</b><br /><span className="text-muted text-xs">Shops or food places where a role may involve alcohol or non-halal food, and finance companies</span></span>
          </label>
          <button className="btn btn-primary">Save halal filter</button>
        </form>
      </section>

      <Section title={`Blocked employers (${blocked.length})`}>
        <p className="text-sm text-muted mb-2">The agent never searches, shows or prepares jobs from these: Israeli companies, IDF suppliers and American defence companies. Matched by whole name. One per line; saving also removes any of their unsent applications.</p>
        <form action={saveBlockedEmployers} className="space-y-2">
          <label className="flex gap-2 items-start font-semibold"><input type="checkbox" name="enabled" defaultChecked={PF.blocklist} className="mt-1 w-4 h-4" /> Block list on</label>
          <textarea name="names" defaultValue={blocked.join("\n")} rows={8} className="input font-mono !text-sm" />
          <button className="btn btn-primary">Save blocked employers</button>
        </form>
      </Section>

      <Section title="Automation & permissions">
        <ul className="text-sm space-y-1.5">
          <li>• <b>Automatic:</b> searching every {settings.search.intervalMinutes / 60} h, verifying listings, eligibility checks, and preparing a tailored application for every open job you're allowed to apply for, each with reasons to submit or skip (up to {settings.automation.autoPreparePerCycle} per search, closing-soon first). Blocked employers: Palantir.</li>
          <li>• <b>Apply now</b> opens the employer's form in Safari on your Mac and the extension fills it automatically, page by page.</li>
          <li>• <b>Always asks you:</b> personal written answers, CAPTCHAs (never bypassed), anything it couldn't fill with certainty, placement-year applications and “now or in the future” visa questions.</li>
          <li>• Email & calendar: not connected. The agent has no access to your accounts.</li>
        </ul>
        <div className="mt-3 space-y-2">
          {([["autoSubmit", "Auto-submit when nothing needs me", "Only for applications you launch yourself with “Apply now” (so you’re always involved at least once). When everything is filled and nothing needs you, it presses Submit after a 10-second countdown you can cancel. Never for placement-year roles."],
             ["autoConsent", "Tick standard privacy-notice boxes for me", "Ticks “I have read the privacy notice / agree to data processing for recruitment”. Never ticks declarations about anything else."]] as const).map(([k, l, d]) => {
            const on = (settings.automation as any)[k];
            return (
              <form key={k} action={setAutomationFlag.bind(null, k, !on)} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex-1"><p className="font-semibold text-sm">{l}</p><p className="text-xs text-muted">{d}</p></div>
                <button className={`btn !py-1 !text-xs ${on ? "btn-primary" : "btn-ghost"}`}>{on ? "On" : "Off"}</button>
              </form>
            );
          })}
        </div>
      </Section>

      <a href="/activity" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Activity log</p><p className="text-sm text-muted">Every action the agent has taken, with charts, search and filters</p></div>
        <span className="text-accent font-semibold">Open →</span>
      </a>

      <a href="/welcome/connect" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Setup checklist</p><p className="text-sm text-muted">Every linked service, checked live, with step-by-step help</p></div>
        <span className="text-accent font-semibold">Open →</span>
      </a>

      <a href="/settings/setup" data-settings-item className="card p-4 flex items-center justify-between" style={{ borderColor: "var(--accent)" }}>
        <div><p className="font-bold">Setup log</p><p className="text-sm text-muted">Everything set up or submitted for you, and what still needs you</p></div>
        <span className="text-accent font-semibold">Open →</span>
      </a>

      <a href="/settings/email" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Job inbox</p><p className="text-sm text-muted">Interview invites, tests and replies detected automatically</p></div>
        <span className="text-accent font-semibold">Open →</span>
      </a>

      <a href="/settings/sites" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Job sites (Reed, Adzuna, Jooble, Careerjet)</p><p className="text-sm text-muted">Free keys that add thousands more jobs in your countries</p></div>
        <span className="text-accent font-semibold">Set up →</span>
      </a>

      <a href="/settings/autofill" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Safari autofill (Mac)</p><p className="text-sm text-muted">Fill application forms in one click; you write personal answers and submit</p></div>
        <span className="text-accent font-semibold">Set up →</span>
      </a>

      <a href="/settings/details" data-settings-item className="card p-4 flex items-center justify-between">
        <div><p className="font-bold">Application details</p><p className="text-sm text-muted">Address, visa expiry, availability: entered once, used in every Apply Kit</p></div>
        <span className="text-accent font-semibold">Edit →</span>
      </a>

      <Section title="Profile (from your CV)">
        {profile ? (
          <div className="text-sm space-y-2">
            <p><b>{profile.name}</b> · {profile.nationality} · {profile.education[0]?.degree}, {profile.education[0]?.year}</p>
            <p className="text-muted">Verified skills: {profile.skills.verified.join(", ")}</p>
            <p className="text-muted">Stated but not on CV (used only after you confirm): {profile.skills.userStated.join(", ")}</p>
            <h3 className="font-semibold pt-1">Open questions</h3>
            <ul className="space-y-1">{profile.openQuestions.map((q, i) => <li key={i}>• {q}</li>)}</ul>
          </div>
        ) : <p className="text-sm text-muted">No profile loaded.</p>}
      </Section>

      <Section title="Security">
        <h3 className="font-semibold text-sm mb-1">Signed-in sessions</h3>
        <ul className="text-sm divide-y divide-line mb-3">
          {sessions.rows.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate">{describeUA(s.user_agent)} · active {timeAgo(s.last_seen_at)}{s.id === me.sessionId ? " · this device" : ""}</span>
              {s.id !== me.sessionId && <form action={revokeSession.bind(null, s.id)}><button className="text-xs font-semibold" style={{ color: "var(--bad)" }}>Sign out</button></form>}
            </li>
          ))}
        </ul>
        <a href="/api/export" className="btn btn-ghost !text-sm">Export all my data (JSON)</a>
        <h3 className="font-semibold text-sm mt-4 mb-1">Audit log</h3>
        <ul className="text-xs text-muted space-y-0.5">{audit.rows.map((a, i) => <li key={i} className="tabular-nums">{fmtTime(a.ts)} · {a.action}</li>)}</ul>
      </Section>
    </div>
  );
}

function describeUA(ua: string | null) {
  if (!ua) return "Unknown device";
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /Android/.test(ua) ? "Android" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return `${dev}${br ? ` (${br})` : ""}`;
}
