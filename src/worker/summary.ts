/** One morning notification (08:00 in the owner's time zone) with everything that matters today. */
import { pool } from "@/db";
import { emit } from "@/lib/events";
import { plural } from "@/lib/notify-text";

export async function dailySummary() {
  const q = async (sql: string) => (await pool.query(sql)).rows[0];
  const [jobs, ready, deadlines, mail, details] = await Promise.all([
    q(`select count(*)::int n, count(*) filter (where match_score >= 60 and eligibility <> 'ineligible')::int strong from jobs where listing_status <> 'hidden' and discovered_at > now() - interval '24 hours'`),
    q(`select count(*)::int n from applications where status = 'awaiting_approval'`),
    q(`select count(*)::int n from applications a join jobs j on j.id = a.job_id where a.status in ('awaiting_approval','approved') and j.deadline between now() and now() + interval '7 days'`),
    q(`select count(*)::int n from emails where needs_action and handled_at is null`),
    q(`select value from settings where key = 'applicationDetails'`),
  ]);
  const dv = details?.value ?? {};
  const missing = [...(dv.addressChoice === "area-only" ? [] : ["addressLine1"]), "postcode", "visaExpiry", "earliestStartSummer", "latestEndSummer", "drivingLicence", "unspentConvictions"].filter((k) => !dv[k]).length;
  const todo = ready.n + mail.n + (missing ? 1 : 0);
  const parts = [
    mail.n ? `📧 ${plural(mail.n, "email")} to reply to` : null,
    ready.n ? `🚀 ${plural(ready.n, "application")} ready to send` : null,
    deadlines.n ? `⏰ ${plural(deadlines.n, "deadline")} this week` : null,
    missing ? `✍️ ${plural(missing, "detail")} to fill in` : null,
    jobs.strong ? `✨ ${plural(jobs.strong, "new strong match", "new strong matches")}` : null,
  ].filter(Boolean);
  await emit({
    type: "daily_summary", level: "info", importance: "important",
    title: todo ? `☀️ Good morning! ${plural(todo, "thing")} for you today` : "☀️ Good morning! Nothing needs you today",
    body: todo ? `${parts.join("\n")}\n👉 Tap to start with the most important one.`
      : `${parts.length ? `${parts.join("\n")}\n` : ""}I'm searching in the background. Enjoy your day 🙂`,
    url: "/",
  });
}

/** Sunday-evening review of the week, plus a nudge for next week. */
export async function weeklyReport() {
  const q = async (sql: string) => (await pool.query(sql)).rows[0];
  const [subm, replies, found, goalRow, checklist] = await Promise.all([
    q(`select count(*)::int n from applications where submitted_at > now() - interval '7 days'`),
    q(`select count(*) filter (where category in ('interview','assessment','offer'))::int good, count(*) filter (where category = 'rejection')::int rej from emails where received_at > now() - interval '7 days'`),
    q(`select count(*) filter (where match_score >= 60 and eligibility <> 'ineligible')::int strong, count(*)::int n from jobs where listing_status <> 'hidden' and discovered_at > now() - interval '7 days'`),
    q(`select value from settings where key = 'goals'`),
    q(`select value from settings where key = 'weeklyChecklist'`),
  ]);
  const goal = goalRow?.value?.applicationsPerWeek ?? 5;
  const done = (checklist?.value?.done ?? []).length;
  const parts = [
    `📤 ${subm.n} of ${goal} applications sent`,
    replies.good ? `🎯 ${replies.good} positive ${replies.good > 1 ? "replies" : "reply"} (tests, interviews, offers)` : null,
    replies.rej ? `💪 ${replies.rej} not this time` : null,
    `✨ ${plural(found.strong, "new strong match", "new strong matches")}`,
    `✅ Weekly routine ${done} of 6 done`,
  ].filter(Boolean);
  // The manager's top orders for next week
  const { orders } = await import("@/lib/manager");
  const top = (await orders()).slice(0, 3).map((o, i) => `${i + 1}. ${o.icon} ${o.title}`);
  await emit({
    type: "daily_summary", level: subm.n >= goal ? "success" : "info", importance: "important",
    title: subm.n >= goal ? "🏆 Weekly goal reached! Great work" : `📊 Your week: ${subm.n} of ${goal} applications sent`,
    body: parts.join("\n") + `\n\n🎯 Next week's top orders:\n${top.join("\n")}\n👉 Tap for your full plan.`,
    url: "/manager",
  });
}

/** 6pm reminder: applications the owner said yes to more than a day ago but hasn't sent yet. */
export async function goAheadNudge() {
  const r = await pool.query(
    `select a.id, j.employer, j.deadline from applications a join jobs j on j.id = a.job_id
     where a.status = 'approved' and a.approved_at < now() - interval '24 hours' order by j.deadline asc nulls last, j.match_score desc`);
  if (!r.rowCount) return;
  const first = r.rows[0];
  const list = r.rows.slice(0, 3).map((x) => `• ${x.employer}`).join("\n");
  await emit({
    type: "info_needed", level: "info", importance: "important",
    title: r.rowCount === 1 ? `⏳ Still to send: ${first.employer}` : `⏳ ${r.rowCount} applications you said yes to are waiting`,
    body: `${list}${r.rowCount > 3 ? `\n+${r.rowCount - 3} more` : ""}\n👉 Tap, then Apply now on your Mac. Autofill does the rest.`,
    url: r.rowCount === 1 ? `/applications/${first.id}#next-steps` : "/applications?tab=going",
  });
}
