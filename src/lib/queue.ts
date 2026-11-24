/** Durable Postgres-backed task queue (FOR UPDATE SKIP LOCKED). */
import { pool } from "@/db";

export type Task = {
  id: string; type: string; payload: any; attempts: number; max_attempts: number; run_at: Date;
};

export async function enqueue(
  type: string,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<string | null> {
  const r = await pool.query(
    `insert into tasks (type, payload, run_at, dedupe_key, max_attempts)
     values ($1, $2, coalesce($3, now()), $4, coalesce($5, 4))
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning id`,
    [type, JSON.stringify(payload), opts.runAt ?? null, opts.dedupeKey ?? null, opts.maxAttempts ?? null],
  );
  return r.rows[0]?.id ?? null;
}

/** Claims the next due task. Types in `onlyTypes` (if given) restrict what is claimed. */
export async function claim(workerId: string, onlyTypes?: string[]): Promise<Task | null> {
  const r = await pool.query(
    `update tasks set status = 'running', locked_by = $1, locked_at = now(), attempts = attempts + 1
     where id = (
       select id from tasks
       where status = 'queued' and run_at <= now() and ($2::text[] is null or type = any($2))
       order by run_at limit 1 for update skip locked)
     returning id, type, payload, attempts, max_attempts, run_at`,
    [workerId, onlyTypes ?? null],
  );
  return r.rows[0] ?? null;
}

export async function complete(id: string) {
  await pool.query(`update tasks set status = 'done', finished_at = now(), locked_by = null where id = $1`, [id]);
}

/** Returns true if the task will be retried. */
export async function fail(task: Task, err: unknown): Promise<boolean> {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const retry = task.attempts < task.max_attempts;
  const delaySec = Math.min(3600, 30 * 2 ** (task.attempts - 1));
  await pool.query(
    `update tasks set status = $2, last_error = $3, locked_by = null,
       run_at = case when $2 = 'queued' then now() + ($4 || ' seconds')::interval else run_at end,
       finished_at = case when $2 = 'failed' then now() else null end
     where id = $1`,
    [task.id, retry ? "queued" : "failed", msg.slice(0, 2000), String(delaySec)],
  );
  return retry;
}

/** Re-queues tasks whose worker died mid-run (crash / redeploy recovery). */
export async function recoverStale(minutes = 10): Promise<number> {
  const r = await pool.query(
    `update tasks set status = 'queued', locked_by = null, last_error = coalesce(last_error, '') || ' [recovered after worker loss]'
     where status = 'running' and locked_at < now() - ($1 || ' minutes')::interval`,
    [String(minutes)],
  );
  return r.rowCount ?? 0;
}

export async function cancelQueued(types?: string[]) {
  const r = await pool.query(
    `update tasks set status = 'cancelled', finished_at = now() where status = 'queued' and ($1::text[] is null or type = any($1))`,
    [types ?? null],
  );
  return r.rowCount ?? 0;
}
