/**
 * Free-plan guard. Records how much computing the agent uses each month and, if it is heading towards a
 * free-plan limit, automatically searches less often, so nothing ever needs paying for.
 *
 * Limits used (Vercel Hobby + Supabase Free), with a safety margin: we act at 60% of each.
 */
import { pool } from "@/db";
import { emit } from "@/lib/events";

export const LIMITS = {
  cpuMinutes: 4 * 60,       // Vercel Hobby: 4 h active CPU / month
  memoryGbHours: 360,       // Vercel Hobby: 360 GB-hours provisioned memory / month
  functionMemoryGb: 2,      // Hobby functions run with 2 GB
  dbMb: 500,                // Supabase Free: 500 MB database
};
const ACT_AT = 0.6, RELAX_AT = 0.3;
const BASE_INTERVAL = 240, MAX_INTERVAL = 720;

export type Usage = { month: string; cpuMs: number; wallMs: number; runs: number; since: string };
const monthKey = () => new Date().toISOString().slice(0, 7);

/** Adds one agent run's measured CPU and running time to this month's total. */
export async function recordUsage(cpuMs: number, wallMs: number) {
  const m = monthKey();
  await pool.query(
    `insert into settings (key, value, updated_at) values ('usage', jsonb_build_object('month', $1::text, 'cpuMs', $2::float, 'wallMs', $3::float, 'runs', 1, 'since', now()), now())
     on conflict (key) do update set updated_at = now(), value = case
       when settings.value->>'month' = $1 then jsonb_set(jsonb_set(jsonb_set(settings.value,
         '{cpuMs}', to_jsonb((settings.value->>'cpuMs')::float + $2)),
         '{wallMs}', to_jsonb((settings.value->>'wallMs')::float + $3)),
         '{runs}', to_jsonb((settings.value->>'runs')::int + 1))
       else excluded.value end`,
    [m, Math.round(cpuMs), Math.round(wallMs)]);
}

export type Health = {
  month: string; dayFraction: number;
  cpu: { usedMin: number; projectedMin: number; limitMin: number };
  memory: { usedGbH: number; projectedGbH: number; limitGbH: number };
  db: { usedMb: number; limitMb: number };
  intervalMinutes: number; autoSlowed: boolean; guardChangedAt: string | null;
};

export async function freePlanHealth(): Promise<Health> {
  const [u, db, s] = await Promise.all([
    pool.query(`select value from settings where key = 'usage'`),
    pool.query(`select pg_database_size(current_database())::float / 1048576 as mb`),
    pool.query(`select value from settings where key = 'search'`),
  ]);
  const usage: Usage = u.rows[0]?.value?.month === monthKey() ? u.rows[0].value : { month: monthKey(), cpuMs: 0, wallMs: 0, runs: 0, since: new Date().toISOString() };
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  // project from when measuring began this month (avoids over-projecting on the first day)
  const from = Math.max(start, Date.parse(usage.since ?? new Date(start).toISOString()));
  const measuredFrac = Math.max((now.getTime() - from) / (end - start), 1 / (30 * 24)); // at least 1 hour
  const remainingFrac = (end - now.getTime()) / (end - start);
  const cpuMin = usage.cpuMs / 60000, gbh = (usage.wallMs / 3_600_000) * LIMITS.functionMemoryGb;
  const proj = (used: number) => used + (used / measuredFrac) * remainingFrac;
  const interval = s.rows[0]?.value?.intervalMinutes ?? BASE_INTERVAL;
  return {
    month: usage.month, dayFraction: (now.getTime() - start) / (end - start),
    cpu: { usedMin: cpuMin, projectedMin: proj(cpuMin), limitMin: LIMITS.cpuMinutes },
    memory: { usedGbH: gbh, projectedGbH: proj(gbh), limitGbH: LIMITS.memoryGbHours },
    db: { usedMb: db.rows[0].mb, limitMb: LIMITS.dbMb },
    intervalMinutes: interval, autoSlowed: !!s.rows[0]?.value?.autoSlowed, guardChangedAt: s.rows[0]?.value?.guardChangedAt ?? null,
  };
}

/** Runs from the scheduler: slows searching down before any limit is near, and speeds back up when safe. */
export async function guardFreePlan() {
  const h = await freePlanHealth();
  const worst = Math.max(h.cpu.projectedMin / h.cpu.limitMin, h.memory.projectedGbH / h.memory.limitGbH, h.db.usedMb / h.db.limitMb);
  const setInterval_ = async (m: number, autoSlowed: boolean) =>
    pool.query(`insert into settings (key, value, updated_at) values ('search', $1, now())
                on conflict (key) do update set value = settings.value || excluded.value, updated_at = now()`,
      [JSON.stringify({ intervalMinutes: m, autoSlowed, guardChangedAt: new Date().toISOString() })]);
  const cooled = !h.guardChangedAt || Date.now() - Date.parse(h.guardChangedAt) > 24 * 3600_000; // at most one change a day
  if (cooled && worst >= ACT_AT && h.intervalMinutes < MAX_INTERVAL) {
    const next = Math.min(MAX_INTERVAL, Math.round(h.intervalMinutes * 1.5 / 60) * 60);
    await setInterval_(next, true);
    await emit({ type: "agent_control", level: "warning", title: `🛡️ Free plan protected: searching every ${next / 60} h`,
      body: `This month's use was heading to ${Math.round(worst * 100)}% of a free limit, so I'm searching a little less often. Nothing to pay, nothing to do.`, push: false });
  } else if (cooled && worst < RELAX_AT && h.autoSlowed && h.intervalMinutes > BASE_INTERVAL) {
    const next = Math.max(BASE_INTERVAL, Math.round(h.intervalMinutes / 1.5 / 60) * 60);
    await setInterval_(next, next > BASE_INTERVAL);
  }
  if (h.db.usedMb / h.db.limitMb >= 0.8 && (await pool.query(`select 1 from events where title like '🗄️ Database%' and ts > now() - interval '7 days'`)).rowCount === 0) {
    await emit({ type: "info_needed", level: "warning", title: "🗄️ Database 80% full", body: "The nightly clean-up couldn't keep up. 👉 Tap to see what's using space.", url: "/settings#free-plan" });
  }
  return { worst, ...h };
}
