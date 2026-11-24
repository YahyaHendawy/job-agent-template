/**
 * Creates the 10-minute scheduler inside the owner's own Supabase (pg_cron + pg_net). It's created by
 * the build on first deploy and from the onboarding checklist, so nobody has to paste SQL. The cron
 * secret is kept in Supabase Vault, not in the job text. If a scheduler already exists, it's left
 * alone unless `force` is set.
 */
import pg from "pg";
import { pgConfig } from "@/db/config";
import { secret, appUrl } from "@/lib/keys";

export type SchedulerStatus = { ok: boolean; message: string; created?: boolean };

export async function ensureScheduler(opts: { force?: boolean } = {}): Promise<SchedulerStatus> {
  const url = appUrl(), cron = secret("CRON_SECRET");
  if (!url?.startsWith("https://")) return { ok: false, message: "This app's public address isn't known yet (it is once Vercel deploys it)." };
  if (!cron) return { ok: false, message: "No cron secret: the Supabase connection details are missing from Vercel." };
  const c = new pg.Client(pgConfig("direct"));
  await c.connect();
  try {
    const has = await c.query(`select 1 from pg_extension where extname = 'pg_cron'`).then((r) => !!r.rowCount);
    if (has && !opts.force) {
      const j = await c.query(`select 1 from cron.job where jobname = 'job-agent-tick'`);
      if (j.rowCount) return { ok: true, message: "Scheduler already running every 10 minutes." };
    }
    await c.query(`create extension if not exists pg_cron`);
    await c.query(`create extension if not exists pg_net with schema extensions`);
    const existing = await c.query(`select id from vault.secrets where name = 'job_agent_cron_secret'`);
    if (existing.rowCount) await c.query(`select vault.update_secret($1, $2)`, [existing.rows[0].id, cron]);
    else await c.query(`select vault.create_secret($1, 'job_agent_cron_secret', 'Bearer secret for /api/cron/tick')`, [cron]);
    const safeUrl = url.replace(/[^A-Za-z0-9.:/_-]/g, "");
    const command = `select net.http_get(url := '${safeUrl}/api/cron/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'job_agent_cron_secret')),
      timeout_milliseconds := 10000)`;
    await c.query(`select cron.unschedule(jobid) from cron.job where jobname = 'job-agent-tick'`);
    await c.query(`select cron.schedule('job-agent-tick', '*/10 * * * *', $1)`, [command]);
    await c.query(`select cron.unschedule(jobid) from cron.job where jobname = 'job-agent-cleanup'`);
    await c.query(`select cron.schedule('job-agent-cleanup', '17 3 * * *', $1)`, [
      `delete from net._http_response where created < now() - interval '2 days'; delete from cron.job_run_details where end_time < now() - interval '7 days';`]);
    return { ok: true, created: true, message: "Scheduler created: the agent now runs every 10 minutes, even with your phone off." };
  } finally {
    await c.end();
  }
}
