"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/db";
import {
  requireUser, createSession, destroySession, hashPassword, verifyPassword, ownerExists, loginBlocked, clientInfo,
} from "@/lib/auth";
import { emit, audit } from "@/lib/events";
import { enqueue, cancelQueued } from "@/lib/queue";
import { setSetting } from "@/lib/settings";
import { kickRunner } from "@/lib/kick";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function setupAction(_: unknown, f: FormData) {
  if (await ownerExists()) return { error: "Owner account already exists." };
  const token = process.env.OWNER_SETUP_TOKEN;
  if (!token || str(f, "token") !== token) return { error: "Invalid setup token." };
  const email = str(f, "email").toLowerCase(), name = str(f, "name"), pw = str(f, "password");
  if (!email.includes("@") || name.length < 2) return { error: "Enter your name and email." };
  if (pw.length < 12) return { error: "Use a password of at least 12 characters." };
  const r = await pool.query(`insert into users (email, name, password_hash) values ($1,$2,$3) returning id`, [email, name, await hashPassword(pw)]);
  const { ip } = await clientInfo();
  await audit("owner_created", { email }, r.rows[0].id, ip);
  await createSession(r.rows[0].id);
  redirect("/welcome");
}

export async function loginAction(_: unknown, f: FormData) {
  const { ip } = await clientInfo();
  if (await loginBlocked(ip)) return { error: "Too many attempts. Try again in 15 minutes." };
  const email = str(f, "email").toLowerCase();
  const u = (await pool.query(`select id, password_hash from users where email = $1`, [email])).rows[0];
  if (!u || !(await verifyPassword(str(f, "password"), u.password_hash))) {
    await audit("login_failed", { email }, null, ip);
    return { error: "Incorrect email or password." };
  }
  await audit("login", {}, u.id, ip);
  await createSession(u.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

async function guarded(action: string, detail?: Record<string, unknown>) {
  const u = await requireUser();
  const { ip } = await clientInfo();
  await audit(action, detail, u.id, ip);
  return u;
}

export async function setAgentStatus(status: "running" | "paused") {
  await guarded(`agent_${status}`);
  await pool.query(`update agent_state set status = $1, emergency_stop = false, updated_at = now() where id = 1`, [status]);
  await emit({ type: "agent_control", level: status === "running" ? "success" : "warning", title: status === "running" ? "Agent resumed" : "Agent paused", body: "Changed from the app.", push: false });
  revalidatePath("/", "layout");
}

export async function emergencyStop() {
  await guarded("emergency_stop");
  await pool.query(`update agent_state set status = 'paused', emergency_stop = true, current_activity = null, updated_at = now() where id = 1`);
  const n = await cancelQueued(["search_cycle", "check_source", "cycle_complete", "prepare_application", "submit_application"]);
  await emit({ type: "agent_control", level: "error", importance: "urgent", title: "Emergency stop activated", body: `All automation halted. ${n} queued task(s) cancelled. Running tasks finish their current step only.` });
  kickRunner(30_000); // delivers the stop notification
  revalidatePath("/", "layout");
}

export async function runSearchNow() {
  await guarded("search_now");
  const slot = `manual-${new Date().toISOString()}`;
  await enqueue("search_cycle", { slot, trigger: "manual (from app)" }, { dedupeKey: `cycle:${slot}` });
  kickRunner(240_000);
  revalidatePath("/");
}

export async function prepareApplicationAction(jobId: string) {
  await guarded("prepare_application", { jobId });
  const r = await pool.query(
    `insert into applications (job_id, status) values ($1, 'draft') on conflict (job_id) do update set updated_at = now() returning id, status`, [jobId]);
  const app = r.rows[0];
  if (app.status === "draft") await enqueue("prepare_application", { applicationId: app.id }, { dedupeKey: `prepare:${app.id}:${Date.now()}` });
  kickRunner();
  redirect(`/applications/${app.id}`);
}

export async function approveApplication(id: string) {
  await guarded("approve_application", { id });
  const r = await pool.query(`update applications set status = 'approved', approved_at = now(), updated_at = now() where id = $1 and status = 'awaiting_approval' returning id`, [id]);
  if (r.rowCount) await emit({ type: "application_approved", level: "success", title: "Application approved", body: "Approved in the app. Open the employer page to submit — automated submission is not enabled.", applicationId: id, push: false });
  revalidatePath(`/applications/${id}`);
}

/** The next application still waiting for a decision (closing soonest, then best match), skipping the current one. */
async function nextUndecided(exceptId: string): Promise<string | null> {
  const r = await pool.query(
    `select a.id from applications a join jobs j on j.id = a.job_id where a.status = 'awaiting_approval' and a.id <> $1
     order by (j.deadline is not null and j.deadline > now()) desc, j.deadline asc nulls last, j.match_score desc limit 1`, [exceptId]);
  return r.rows[0]?.id ?? null;
}

const DECLINE_REASONS: Record<string, string> = {
  not_interested: "Not interested in this role", location: "Location doesn't work", dates: "Dates don't fit my studies",
  eligibility: "I don't think I'm eligible", employer: "Not this employer", too_much: "Too much work for the chance", other: "Other",
};

/** ✅ Yes: go ahead, and let the app do as much as possible in the background. */
export async function decideYes(id: string) {
  await guarded("decide_yes", { id });
  const r = await pool.query(`update applications set status = 'approved', approved_at = now(), updated_at = now() where id = $1 and status in ('awaiting_approval','declined') returning id`, [id]);
  if (r.rowCount) {
    const { setNote, goAhead } = await import("@/lib/goahead");
    await setNote(id, { decision: { choice: "yes", at: new Date().toISOString() } });
    after(async () => { try { await goAhead(id); } catch (e) { console.error("[goAhead]", e); } });
  }
  revalidatePath(`/applications/${id}`); revalidatePath("/applications"); revalidatePath("/");
  redirect(`/applications/${id}?decided=yes#next-steps`);
}

/** 👎 No: kept in "Not doing" with the reason, and the next application to decide opens. */
export async function decideNo(id: string, f: FormData) {
  const reason = DECLINE_REASONS[str(f, "reason")] ? str(f, "reason") : "other";
  await guarded("decide_no", { id, reason });
  await pool.query(`update applications set status = 'declined', updated_at = now() where id = $1 and status in ('awaiting_approval','approved')`, [id]);
  const { setNote } = await import("@/lib/goahead");
  await setNote(id, { decision: { choice: "no", reason, reasonText: DECLINE_REASONS[reason], at: new Date().toISOString() } });
  revalidatePath("/applications"); revalidatePath("/");
  const next = await nextUndecided(id);
  redirect(next ? `/applications/${next}?from=decided` : "/applications?tab=notdoing");
}

/** Decide later: just move on to the next one. */
export async function decideLater(id: string) {
  await requireUser();
  const next = await nextUndecided(id);
  redirect(next ? `/applications/${next}?from=later` : "/applications");
}

/** Bring a "Not doing" application back to "To decide". */
export async function reconsider(id: string) {
  await guarded("reconsider", { id });
  await pool.query(`update applications set status = 'awaiting_approval', updated_at = now() where id = $1 and status in ('declined','withdrawn') and submitted_at is null`, [id]);
  const { setNote } = await import("@/lib/goahead");
  await setNote(id, { decision: null });
  revalidatePath(`/applications/${id}`); revalidatePath("/applications");
}

/** Owner records a submission they made themselves; a confirmation reference is required as evidence. */
export async function markSubmitted(id: string, f: FormData) {
  const ref = str(f, "evidence");
  if (ref.length < 4) return;
  await guarded("mark_submitted", { id });
  const r = await pool.query(
    `update applications set status = 'submitted', submitted_at = now(), submission_evidence = $2, updated_at = now()
     where id = $1 and status in ('approved','awaiting_approval') returning id`,
    [id, JSON.stringify({ kind: "owner_reported", reference: ref, at: new Date().toISOString() })]);
  if (r.rowCount) { await emit({ type: "application_submitted", level: "success", title: "Submission recorded", body: `Submitted by you. Evidence: ${ref}`, applicationId: id }); kickRunner(30_000); }
  revalidatePath(`/applications/${id}`);
}

export async function setApplicationStatus(id: string, status: string) {
  const allowed = ["assessment", "interview", "offer", "rejected", "withdrawn"];
  if (!allowed.includes(status)) return;
  await guarded("application_status", { id, status });
  await pool.query(`update applications set status = $2, updated_at = now() where id = $1`, [id, status]);
  await emit({ type: status === "interview" ? "interview_detected" : "employer_response", title: `Application marked: ${status}`, applicationId: id, push: false });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/applications");
  revalidatePath("/");
}

export async function toggleJobFlag(id: string, flag: "starred" | "dismissed") {
  await requireUser();
  await pool.query(`update jobs set ${flag === "starred" ? "starred = not starred" : "dismissed = not dismissed"}, updated_at = now() where id = $1`, [id]);
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
}

export async function setNotificationMode(mode: "action" | "all" | "important" | "quiet") {
  if (!["action", "all", "important", "quiet"].includes(mode)) return;
  await guarded("notification_mode", { mode });
  await setSetting("notifications", { mode });
  revalidatePath("/settings");
}

export async function saveHalal(f: FormData) {
  const { HALAL_CATEGORIES, applyHalal } = await import("@/lib/halal");
  const next: Record<string, boolean> = { flagGreyAreas: f.get("flagGreyAreas") === "on" };
  for (const c of HALAL_CATEGORIES) next[c.key] = f.get(c.key) === "on";
  await guarded("halal_settings", next);
  await pool.query(`insert into settings (key, value, updated_at) values ('halal', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  const { savePersona, loadPersona } = await import("@/lib/persona");
  const on = f.get("enabled") === "on";
  await savePersona({ filters: { ...(await loadPersona(true)).filters, halal: on } });
  if (on) await applyHalal(next as any);
  revalidatePath("/settings"); revalidatePath("/applications"); revalidatePath("/jobs"); revalidatePath("/");
}

export async function saveBlockedEmployers(f: FormData) {
  const list = [...new Set(str(f, "names").split(/\n|,/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 80))].slice(0, 500);
  await guarded("blocked_employers", { count: list.length });
  await pool.query(`insert into settings (key, value, updated_at) values ('blockedEmployers', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(list)]);
  const { applyBlocklist } = await import("@/lib/blocked");
  const { savePersona, loadPersona } = await import("@/lib/persona");
  const on = f.get("enabled") === "on";
  await savePersona({ filters: { ...(await loadPersona(true)).filters, blocklist: on } });
  if (on) await applyBlocklist(list);
  revalidatePath("/settings"); revalidatePath("/applications"); revalidatePath("/jobs"); revalidatePath("/");
}

export async function setSearchInterval(f: FormData) {
  const m = Math.max(60, Math.min(1440, Number(str(f, "interval")) || 240));
  await guarded("search_interval", { minutes: m });
  await setSetting("search", { intervalMinutes: m, autoSlowed: false });
  revalidatePath("/settings");
}

export async function toggleSource(id: string) {
  await guarded("toggle_source", { id });
  await pool.query(`update sources set enabled = not enabled where id = $1`, [id]);
  revalidatePath("/settings");
}

export async function revokeSession(id: string) {
  await guarded("revoke_session", { id });
  await pool.query(`update sessions set revoked_at = now() where id = $1`, [id]);
  revalidatePath("/settings");
}

export async function removeDevice(id: string) {
  await guarded("remove_push_device", { id });
  await pool.query(`delete from push_subscriptions where id = $1`, [id]);
  revalidatePath("/settings");
}

export async function setAutomationFlag(flag: "autoSubmit" | "autoConsent", on: boolean) {
  await guarded(`automation_${flag}`, { on });
  await setSetting("automation", { [flag]: on } as any);
  await emit({ type: "agent_control", level: on ? "warning" : "info", title: `${flag === "autoSubmit" ? "Auto-submit" : "Auto-acknowledge privacy notices"} turned ${on ? "ON" : "OFF"}`, body: "Changed in Settings.", push: false });
  revalidatePath("/settings");
}

export async function markEmailHandled(id: string) {
  await requireUser();
  await pool.query(`update emails set handled_at = now() where id = $1`, [id]);
  revalidatePath("/");
}

export async function saveWrittenAnswer(appId: string, key: string, question: string, answer: string) {
  await requireUser();
  const { saveWritten } = await import("@/lib/written");
  await saveWritten(appId, key, question, answer);
  revalidatePath(`/applications/${appId}`);
  revalidatePath("/");
}

export async function setDetail(key: "futureSponsorship" | "drivingLicence" | "unspentConvictions", value: string) {
  const u = await requireUser();
  const allowed: Record<string, string[]> = { futureSponsorship: ["yes", "ask"], drivingLicence: ["yes", "no"], unspentConvictions: ["yes", "no"] };
  if (!allowed[key]?.includes(value)) return;
  const r = await pool.query(`select value from settings where key = 'applicationDetails'`);
  const next = { ...(r.rows[0]?.value ?? {}), [key]: value };
  await pool.query(`insert into settings (key, value, updated_at) values ('applicationDetails', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  await audit("detail_set", { key, value }, u.id);
  revalidatePath("/", "layout");
}

export async function toggleWeeklyItem(id: string) {
  await requireUser();
  const { toggleWeekly } = await import("@/lib/guide");
  await toggleWeekly(id);
  revalidatePath("/");
  revalidatePath("/todo");
}

/** The owner found a job themselves (LinkedIn, a company site…): add it and let the agent take over. */
export async function addJobByLink(f: FormData) {
  const u = await requireUser();
  const url = String(f.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) redirect("/jobs/new?error=url");
  // Never fetch internal/private addresses
  try { const h = new URL(url).hostname; if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/.test(h) || h.endsWith(".internal") || h.endsWith(".local")) redirect("/jobs/new?error=url"); } catch { redirect("/jobs/new?error=url"); }
  let title = String(f.get("title") ?? "").trim(), employer = String(f.get("employer") ?? "").trim(), description = String(f.get("description") ?? "").trim();
  let location = String(f.get("location") ?? "").trim();
  try {
    const { htmlToText, decodeEntities } = await import("@/connectors/http");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (Macintosh) JobAgent/0.1", Accept: "text/html" } });
    clearTimeout(t);
    if (res.ok) {
      const html = (await res.text()).slice(0, 600_000);
      const meta = (p: string) => decodeEntities((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ?? "").trim());
      title ||= meta("og:title") || decodeEntities((html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? "").trim());
      employer ||= meta("og:site_name");
      const pageTitle = decodeEntities((html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? "").trim());
      employer ||= pageTitle.match(/\bat ([A-Z][\w&.'’ -]{1,40}?)(?:\s*[|\-–(]|$)/)?.[1]?.trim() ?? "";
      if (!description) description = htmlToText(html.replace(/<(header|nav|footer)[\s\S]*?<\/\1>/gi, "")).slice(0, 15000);
    }
  } catch { /* page may block bots — the user's fields are enough */ }
  if (!title) redirect(`/jobs/new?error=title&url=${encodeURIComponent(url)}`);
  if (!employer || /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workday)$/i.test(employer)) {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    const fromPath = /greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com/.test(u.host) ? seg : "";
    const fromHost = u.host.replace(/^(www|careers|jobs|apply|boards)\./, "").split(".")[0];
    const raw = fromPath || (/linkedin|indeed|glassdoor/.test(u.host) ? "" : fromHost);
    employer = raw ? raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : employer;
  }
  title = title.replace(/\s*[|\-–]\s*(LinkedIn|Indeed.*|Glassdoor|Careers?.*)$/i, "").slice(0, 200);
  const { evaluate } = await import("@/matching");
  const { getProfile } = await import("@/profile");
  const ev = evaluate({ title, employer: employer || "Unknown employer", location, description }, await getProfile());
  const { createHash } = await import("node:crypto");
  const fp = "manual:" + createHash("sha256").update(url).digest("hex").slice(0, 32);
  const ins = await pool.query(
    `insert into jobs (fingerprint, employer, title, location, country, category, application_url, source_url, description, listing_status, last_verified_at, last_seen_at,
       eligibility, eligibility_reasons, missing_evidence, match_score, match_reasons, starred, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$7,$8,'open',now(),now(),$9,$10,$11,$12,$13,true,'Added by you from a link')
     on conflict (fingerprint) do update set updated_at = now() returning id`,
    [fp, employer || "Unknown employer", title, location || null, ev.country, ev.category, url, description || null, ev.eligibility.status,
     JSON.stringify(ev.eligibility.reasons), JSON.stringify(ev.eligibility.missing), ev.score, JSON.stringify(ev.scoreReasons)]);
  const jobId = ins.rows[0].id;
  const app = await pool.query(`insert into applications (job_id, status) values ($1, 'draft') on conflict (job_id) do update set updated_at = now() returning id, status`, [jobId]);
  if (app.rows[0].status === "draft") await enqueue("prepare_application", { applicationId: app.rows[0].id }, { dedupeKey: `prepare:${app.rows[0].id}:${Date.now()}` });
  await audit("job_added_by_link", { host: new URL(url).host }, u.id);
  await emit({ type: "job_found", level: "success", title: `Added: ${title} — ${employer || "employer"}`, body: `From your link. Match ${ev.score}/100 · ${ev.eligibility.status.replace(/_/g, " ")}. Preparing your application.`, jobId, push: false });
  kickRunner();
  redirect(`/applications/${app.rows[0].id}`);
}

export async function setInterviewTime(appId: string, f: FormData) {
  await requireUser();
  const when = String(f.get("when") ?? "");
  const where = String(f.get("where") ?? "").slice(0, 300);
  const { setNote } = await import("@/lib/goahead");
  await setNote(appId, { interviewAt: when, interviewWhere: where }); // merge: keeps the decision and other notes
  revalidatePath(`/applications/${appId}`);
}

export async function setWeeklyGoal(f: FormData) {
  await requireUser();
  const n = Math.max(1, Math.min(50, Number(f.get("goal")) || 5));
  await setSetting("goals", { applicationsPerWeek: n });
  revalidatePath("/");
}

/* ---------------- "Your part": things only the owner can do ---------------- */

/** Applied somewhere the app didn't see (LinkedIn Easy Apply, a careers fair, a company site…): track it like any other. */
export async function logOwnApplication(f: FormData) {
  const u = await requireUser();
  const employer = str(f, "employer").slice(0, 120), title = str(f, "title").slice(0, 200), site = str(f, "site").slice(0, 60) || "another website";
  let url = str(f, "url");
  if (url && !/^https?:\/\//i.test(url)) url = "";
  if (!employer || !title) redirect("/todo?error=own#own");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(str(f, "when")) ? str(f, "when") : new Date().toISOString().slice(0, 10);
  const { evaluate } = await import("@/matching");
  const { getProfile } = await import("@/profile");
  const ev = evaluate({ title, employer, location: str(f, "location"), description: "" }, await getProfile());
  const { createHash } = await import("node:crypto");
  const fp = "own:" + createHash("sha256").update(`${employer.toLowerCase()}|${title.toLowerCase()}|${url}`).digest("hex").slice(0, 32);
  const job = await pool.query(
    `insert into jobs (fingerprint, employer, title, location, country, category, application_url, source_url, listing_status, last_verified_at, last_seen_at,
       eligibility, eligibility_reasons, missing_evidence, match_score, match_reasons, starred, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$7,'open',now(),now(),$8,$9,$10,$11,$12,true,$13)
     on conflict (fingerprint) do update set updated_at = now() returning id`,
    [fp, employer, title, str(f, "location") || null, ev.country, ev.category, url || null, ev.eligibility.status, JSON.stringify(ev.eligibility.reasons),
     JSON.stringify(ev.eligibility.missing), ev.score, JSON.stringify(ev.scoreReasons), `You applied yourself on ${site}`]);
  const evidence = JSON.stringify({ kind: "owner_reported", reference: `Applied by you on ${site}`, at: new Date(`${day}T12:00:00Z`).toISOString() });
  const app = await pool.query(
    `insert into applications (job_id, status, submitted_at, submission_evidence) values ($1, 'submitted', $2, $3)
     on conflict (job_id) do update set status = case when applications.status in ('draft','preparing','awaiting_approval','approved','declined') then 'submitted' else applications.status end,
       submitted_at = coalesce(applications.submitted_at, excluded.submitted_at), submission_evidence = coalesce(applications.submission_evidence, excluded.submission_evidence), updated_at = now()
     returning id`, [job.rows[0].id, `${day}T12:00:00Z`, evidence]);
  await audit("own_application_logged", { site }, u.id);
  await emit({ type: "application_submitted", level: "success", title: `📨 Tracking: ${title} at ${employer}`, body: `You applied on ${site}. I'll link their emails to it and remind you to follow up.`, applicationId: app.rows[0].id, push: false });
  revalidatePath("/todo"); revalidatePath("/applications"); revalidatePath("/");
  redirect("/todo?logged=1#own");
}

/** One-tap "I've sent it" (no reference needed). */
export async function quickMarkSent(id: string) {
  await guarded("mark_submitted", { id });
  const r = await pool.query(
    `update applications set status = 'submitted', submitted_at = now(), submission_evidence = $2, updated_at = now() where id = $1 and status = 'approved' returning id`,
    [id, JSON.stringify({ kind: "owner_reported", reference: "Sent by you", at: new Date().toISOString() })]);
  if (r.rowCount) await emit({ type: "application_submitted", level: "success", title: "📨 Sent: recorded", body: "Marked as sent by you. I'll watch the inbox for their reply.", applicationId: id, push: false });
  revalidatePath("/todo"); revalidatePath("/"); revalidatePath(`/applications/${id}`);
}

/** No reply after a while: wait two more weeks, or close it. */
export async function chaseLater(id: string) {
  await requireUser();
  const { setNote } = await import("@/lib/goahead");
  await setNote(id, { chaseAfter: new Date(Date.now() + 14 * 86400_000).toISOString() });
  revalidatePath("/todo");
}
export async function markNoReply(id: string) {
  await requireUser();
  const { setNote } = await import("@/lib/goahead");
  await setNote(id, { noReply: new Date().toISOString() });
  await pool.query(`update applications set status = 'rejected', updated_at = now() where id = $1 and status = 'submitted'`, [id]);
  revalidatePath("/todo"); revalidatePath("/applications");
}

/** One-off set-up items (accounts and alerts the app can't create). */
export async function toggleOnceItem(id: string) {
  await requireUser();
  const r = await pool.query(`select value from settings where key = 'onceChecklist'`);
  const done: string[] = r.rows[0]?.value?.done ?? [];
  await pool.query(`insert into settings (key, value, updated_at) values ('onceChecklist', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ done: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] })]);
  revalidatePath("/todo");
}

/* ---------------- Career manager ---------------- */
async function saveTracks(patch: (v: { month: string; done: string[]; learned: string[] }) => void) {
  await requireUser();
  const { tracksState } = await import("@/lib/manager");
  const v = await tracksState();
  patch(v);
  await pool.query(`insert into settings (key, value, updated_at) values ('careerTracks', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(v)]);
  revalidatePath("/manager");
}
/** Tick a monthly career move (resets each month). */
export async function toggleMove(id: string) {
  await saveTracks((v) => { v.done = v.done.includes(id) ? v.done.filter((x) => x !== id) : [...v.done, id]; });
}
/** "I've learned this" for a skill-gap item (remember to add it to the CV too). */
export async function toggleLearned(key: string) {
  await saveTracks((v) => { v.learned = v.learned.includes(key) ? v.learned.filter((x) => x !== key) : [...v.learned, key]; });
  await pool.query(`delete from settings where key = 'skillGapCache'`);
}

/** Settings → Appearance: save the whole look (validated against the defaults). */
export async function saveAppearance(json: string) {
  await requireUser();
  const { DEFAULT_APPEARANCE, ALL_TABS, THEMES } = await import("@/lib/look");
  let v: any = {};
  try { v = JSON.parse(json); } catch { return; }
  const D = DEFAULT_APPEARANCE as any;
  const out: any = {};
  for (const k of Object.keys(D)) {
    if (k === "home") { out.home = Object.fromEntries(Object.keys(D.home).map((h) => [h, typeof v.home?.[h] === "boolean" ? v.home[h] : D.home[h]])); continue; }
    if (k === "tabs") { const t = Array.isArray(v.tabs) ? v.tabs.filter((x: string) => ALL_TABS.some((a) => a.href === x)) : []; out.tabs = t.length >= 2 ? t.slice(0, 7) : D.tabs; continue; }
    if (typeof D[k] === "boolean") out[k] = typeof v[k] === "boolean" ? v[k] : D[k];
    else out[k] = typeof v[k] === "string" ? String(v[k]).slice(0, 40) : D[k];
  }
  if (!(out.theme in THEMES)) out.theme = D.theme;
  if (out.accent && !/^#[0-9a-f]{6}$/i.test(out.accent)) out.accent = "";
  await pool.query(`insert into settings (key, value, updated_at) values ('appearance', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(out)]);
  revalidatePath("/", "layout");
}

/** Email the recruiter about an application (only when the owner taps Send). Optionally attaches the tailored CV. */
export async function emailRecruiter(appId: string, f: FormData) {
  const u = await requireUser();
  const to = str(f, "to").toLowerCase(), subject = str(f, "subject").slice(0, 200), text = str(f, "text").slice(0, 8000);
  const { findContacts } = await import("@/lib/contacts");
  const a = (await pool.query(`select a.id, a.status, a.cv_markdown, j.description, j.employer, j.title from applications a join jobs j on j.id = a.job_id where a.id = $1`, [appId])).rows[0];
  if (!a) return;
  // Only to a published contact for this application
  const { contacts } = await findContacts(a);
  if (!contacts.some((c) => c.email === to) || subject.length < 3 || text.length < 20 || /\[(Write one or two sentences|Your name)/.test(text)) redirect(`/applications/${appId}?mail=invalid#recruiter`);
  await guarded("email_recruiter", { appId });
  const attachments: { filename: string; content: Buffer }[] = [];
  if (f.get("attachCv") && a.cv_markdown) {
    const { cvPdf } = await import("@/lib/cvpdf");
    const name = (await pool.query(`select data->>'name' n from profile where id = 1`)).rows[0]?.n ?? "CV";
    attachments.push({ filename: `${String(name).replace(/[^A-Za-z ]/g, "").trim().replace(/ /g, "_") || "CV"}_CV.pdf`, content: Buffer.from(await cvPdf(a.cv_markdown, `${name} - CV`)) });
  }
  const det = (await pool.query(`select value from settings where key = 'applicationDetails'`)).rows[0]?.value ?? {};
  try {
    const { sendEmail } = await import("@/lib/mailer");
    await sendEmail({ to, subject, text, attachments, fromName: [det.firstName, det.lastName].filter(Boolean).join(" ") || undefined });
  } catch { redirect(`/applications/${appId}?mail=failed#recruiter`); }
  const { setNote } = await import("@/lib/goahead");
  await setNote(appId, { recruiterEmail: { to, at: new Date().toISOString(), cv: attachments.length > 0 } });
  await audit("recruiter_emailed", { appId }, u.id);
  // "Email instead of the form": counts as sent
  if (f.get("asApplication") && ["approved", "awaiting_approval"].includes(a.status)) {
    await pool.query(`update applications set status = 'submitted', submitted_at = now(), submission_evidence = $2, updated_at = now() where id = $1`,
      [appId, JSON.stringify({ kind: "owner_reported", reference: `Emailed to ${to}`, at: new Date().toISOString() })]);
  }
  await emit({ type: "application_submitted", level: "success", title: `✉️ Emailed ${to}`, body: `About ${a.title} at ${a.employer}${attachments.length ? " (CV attached)" : ""}.`, applicationId: appId, push: false });
  revalidatePath(`/applications/${appId}`);
  redirect(`/applications/${appId}?mail=sent#recruiter`);
}
