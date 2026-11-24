import { pool } from "@/db";
import { getSettings } from "@/lib/settings";
import { setWeeklyGoal } from "@/app/actions";
import { Progress } from "./charts";
import { CountUp } from "./CountUp";

/** Weekly application goal with streak. */
export async function GoalCard() {
  const goal = (await getSettings()).goals.applicationsPerWeek;
  const r = await pool.query(`
    with w as (select date_trunc('week', submitted_at) wk, count(*) n from applications where submitted_at is not null group by 1)
    select coalesce((select n from w where wk = date_trunc('week', now())), 0)::int this_week,
           coalesce((select n from w where wk = date_trunc('week', now()) - interval '1 week'), 0)::int last_week,
           (select count(*)::int from applications where submitted_at is not null) total`);
  const { this_week, last_week, total } = r.rows[0];
  const pct = Math.min(100, Math.round((this_week / goal) * 100));
  const msg = this_week >= goal ? "Goal reached — brilliant. Anything extra is a bonus." : this_week === 0 ? "Open Applications → To decide, say ✅ Yes to one and send it this week." : `${goal - this_week} more to hit your goal.`;
  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-lg">Weekly goal</h2>
        <span className="text-xs text-muted">Last week: {last_week} · All time: {total}</span>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-4xl font-bold tabular-nums" style={{ color: pct >= 100 ? "var(--good)" : "var(--ink)" }}><CountUp value={this_week} /></p>
        <p className="text-muted pb-1">of {goal} applications submitted this week</p>
      </div>
      <Progress value={this_week} max={goal} color={pct >= 100 ? "var(--good)" : "var(--accent)"} height={10} />
      <p className="text-sm">{msg}</p>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Change goal</summary>
        <form action={setWeeklyGoal} className="flex gap-2 mt-2"><input name="goal" type="number" min={1} max={50} defaultValue={goal} className="input !w-24 !py-1.5" /><button className="btn btn-ghost !text-xs">Save</button></form>
      </details>
    </section>
  );
}
