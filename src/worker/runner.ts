/**
 * Task runner shared by the local long-running worker and the serverless tick (/api/cron/tick).
 * The free-tier deployment wakes this every 10 minutes; each run drains due tasks within a time budget.
 * All state lives in Postgres, so an interrupted run simply resumes on the next tick.
 */
import { TASK_NAMES, whenLondon, short } from "@/lib/notify-text";
import { persona, loadPersona } from "@/lib/persona";
import { pool } from "@/db";
import { claim, complete, fail, enqueue, recoverStale, type Task } from "@/lib/queue";
import { emit } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { deliverEvent } from "@/lib/push";
import { startCycle, checkSource, completeCycle, deadlineScan, approvalDigest } from "./discovery";
import { prepareApplication } from "./prepare";
import { runBackup } from "./backup";
import { checkInbox } from "./inbox";
import { dailySummary, weeklyReport, goAheadNudge } from "./summary";
import { cleanup } from "./cleanup";
import { recordUsage, guardFreePlan } from "@/lib/usage";

const ALWAYS_TYPES = ["push_event", "noop", "check_inbox", "cleanup", "geocode"]; // inbox keeps being watched even while paused // run even while paused (notifications must still flow)

const handlers: Record<string, (t: Task) => Promise<void>> = {
  search_cycle: (t) => startCycle(t.payload.slot, t.payload.trigger ?? "schedule"),
  check_source: (t) => checkSource(t.payload.sourceId, t.attempts, t.max_attempts),
  cycle_complete: (t) => completeCycle(t.payload.slot, t.payload.startedAt),
  deadline_scan: () => deadlineScan(),
  approval_digest: () => approvalDigest(),
  backup: () => runBackup(),
  check_inbox: async () => { await checkInbox(); },
  daily_summary: () => dailySummary(),
  weekly_report: () => weeklyReport(),
  go_ahead_nudge: () => goAheadNudge(),
  prepare_application: (t) => prepareApplication(t.payload.applicationId),
  push_event: async (t) => { await deliverEvent(t.payload.eventId); },
  cleanup: async () => { await cleanup(); },
  geocode: async () => { const { geocodePending } = await import("@/lib/geo"); await geocodePending(); },
  noop: async () => {},
};

export async function agentState() {
  return (await pool.query(`select status, emergency_stop from agent_state where id = 1`)).rows[0] ?? { status: "running", emergency_stop: false };
}

export async function heartbeat(workerId: string) {
  await pool.query(`update agent_state set worker_heartbeat_at = now(), worker_id = $1 where id = 1`, [workerId]);
}

/** Enqueue the next search cycle if one is due (idempotent via slot dedupe key). */
export async function schedule() {
  await loadPersona();
  // Inbox watcher: every 10 minutes when connected (also while paused, so replies are never missed)
  const hasInbox = (await pool.query(`select 1 from settings where key = 'emailImap'`)).rowCount;
  if (hasInbox) await enqueue("check_inbox", {}, { dedupeKey: `inbox:${Math.floor(Date.now() / 600_000)}`, maxAttempts: 2 });
  // Morning summary at 08:00 in the owner's time zone
  const hourLondon = Number(new Date().toLocaleString("en-GB", { timeZone: persona().timeZone, hour: "2-digit", hour12: false }));
  const dayLondon = new Date().toLocaleDateString("en-CA", { timeZone: persona().timeZone });
  if (hourLondon >= 8) await enqueue("daily_summary", {}, { dedupeKey: `summary:${dayLondon}` });
  const weekdayLondon = new Date().toLocaleDateString("en-GB", { timeZone: persona().timeZone, weekday: "short" });
  if (hourLondon >= 18) await enqueue("go_ahead_nudge", {}, { dedupeKey: `nudge:${dayLondon}` });
  if (weekdayLondon === "Sun" && hourLondon >= 18) await enqueue("weekly_report", {}, { dedupeKey: `weekly:${dayLondon}` });
  await interviewReminders();
  // Map: look up new job locations (free; cached) every 30 minutes
  await enqueue("geocode", {}, { dedupeKey: `geocode:${Math.floor(Date.now() / 1_800_000)}`, maxAttempts: 1 });
  // Nightly housekeeping (keeps the free database small); runs even while paused
  if (hourLondon >= 3) await enqueue("cleanup", {}, { dedupeKey: `cleanup:${dayLondon}`, maxAttempts: 2 });
  await guardFreePlan().catch((e) => console.error("[guard]", e));
  const st = await agentState();
  if (st.emergency_stop || st.status !== "running") return;
  const { intervalMinutes } = (await getSettings()).search;
  const slotMs = intervalMinutes * 60_000;
  const slot = new Date(Math.floor(Date.now() / slotMs) * slotMs).toISOString();
  await enqueue("search_cycle", { slot, trigger: "schedule" }, { dedupeKey: `cycle:${slot}` });
  await enqueue("deadline_scan", {}, { dedupeKey: `deadline_scan:${new Date().toISOString().slice(0, 10)}` });
  // Weekly encrypted backup (one per ISO week; runs even if the agent is paused would be nicer, but schedule() only runs while running)
  const d = new Date(); const week = `${d.getUTCFullYear()}-w${Math.ceil(((+d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7)}`;
  await enqueue("backup", {}, { dedupeKey: `backup:${week}`, maxAttempts: 3 });
}

async function runOnly(workerId: string, types: string[]) {
  const task = await claim(workerId, types);
  if (!task) return false;
  try { await handlers[task.type](task); await complete(task.id); }
  catch (e) { await fail(task, e).catch(() => {}); }
  return true;
}

/** Runs one task if one is due. Returns false when nothing is due. */
export async function runOne(workerId: string): Promise<boolean> {
  await loadPersona();
  const st = await agentState();
  const onlyAlways = st.emergency_stop || st.status !== "running";
  const task = await claim(workerId, onlyAlways ? ALWAYS_TYPES : undefined);
  if (!task) return false;
  try {
    const h = handlers[task.type];
    if (!h) throw new Error(`Unknown task type ${task.type}`);
    await h(task);
    await complete(task.id);
  } catch (e) {
    const retry = await fail(task, e).catch(() => false);
    if (!retry && task.type !== "check_source" && task.type !== "push_event")
      await emit({ type: "system_error", level: "error", title: `⚠️ Problem with the ${TASK_NAMES[task.type] ?? task.type}`, body: `It failed after several tries. Everything else keeps running.\n👉 Tap for details. Usually it fixes itself next run.`, data: { error: String((e as Error).message ?? e).slice(0, 300) } }).catch(() => {});
  }
  return true;
}

/**
 * Drains due tasks until the budget is used. Waits briefly for tasks due within the budget
 * (search checks are spaced a few seconds apart to be polite to employer sites).
 */
export async function drain(workerId: string, budgetMs: number, opts: { schedule?: boolean } = {}) {
  const deadline = Date.now() + budgetMs;
  const cpu0 = process.cpuUsage(), t0 = Date.now();
  const prev = (await pool.query(`select worker_heartbeat_at from agent_state where id = 1`)).rows[0]?.worker_heartbeat_at;
  if (prev && Date.now() - new Date(prev).getTime() > 40 * 60_000) {
    const mins = Math.round((Date.now() - new Date(prev).getTime()) / 60_000);
    await emit({ type: "system_error", level: "warning", title: "🔄 Back online", body: `I was paused for ${mins >= 120 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`} (since ${whenLondon(prev)}) and have caught up. Nothing to do.` });
  }
  await heartbeat(workerId);
  await recoverStale(10);
  if (opts.schedule !== false) await schedule();
  let ran = 0;
  while (Date.now() < deadline - 15_000) { // leave room for the last task to finish
    if (await runOne(workerId)) { ran++; continue; }
    const next = await pool.query(`select min(run_at) as t from tasks where status = 'queued'`);
    const t = next.rows[0]?.t ? new Date(next.rows[0].t).getTime() : null;
    if (!t || t > deadline - 20_000) break; // nothing due within this run
    await new Promise((r) => setTimeout(r, Math.min(Math.max(t - Date.now(), 200), 3000)));
  }
  // Never leave notifications waiting for the next run: deliver any still queued (they are fast).
  const pushDeadline = Date.now() + 20_000;
  while (Date.now() < pushDeadline && (await runOnly(workerId, ["push_event"]))) ran++;
  await heartbeat(workerId);
  const cpu = process.cpuUsage(cpu0);
  await recordUsage((cpu.user + cpu.system) / 1000, Date.now() - t0).catch(() => {});
  return { ran };
}

/** Interview reminders: the day before and 1 hour before (times are local to the owner, saved from the app). */
async function interviewReminders() {
  const rows = (await pool.query(`select a.id, a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.status = 'interview' and a.notes like '%interviewAt%'`)).rows;
  if (!rows.length) return;
  const now = new Date();
  const londonOffsetMin = (Date.parse(now.toLocaleString("en-US", { timeZone: persona().timeZone })) - Date.parse(now.toLocaleString("en-US", { timeZone: "UTC" }))) / 60000;
  for (const r of rows) {
    let n: any = {}; try { n = JSON.parse(r.notes); } catch { continue; }
    if (!n.interviewAt) continue;
    const at = Date.parse(`${n.interviewAt}:00Z`) - londonOffsetMin * 60000;
    const mins = (at - now.getTime()) / 60000;
    for (const [label, lo, hi] of [["tomorrow", 60 * 20, 60 * 26], ["in 1 hour", 40, 75]] as const) {
      if (mins < lo || mins > hi) continue;
      const id = await enqueue("noop", {}, { dedupeKey: `interview-reminder:${r.id}:${n.interviewAt}:${label}` });
      if (!id) continue;
      await emit({ type: "deadline_approaching", level: "warning", importance: "urgent", title: label === "tomorrow" ? `📅 Interview tomorrow: ${r.employer}` : `⏳ Interview in 1 hour: ${r.employer}`, body: `${short(r.title)}${n.interviewWhere ? `\n📍 ${n.interviewWhere}` : ""}\n👉 ${label === "tomorrow" ? "Tap for your prep questions. Test your camera or plan your route tonight." : "Tap for your notes. Aim to be ready 10 minutes early. Good luck!"}`, applicationId: r.id, url: `/applications/${r.id}` });
    }
  }
}
