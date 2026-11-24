/**
 * Nightly housekeeping so the free database (500 MB) never fills up. Keeps everything that matters:
 * jobs, applications, emails, your answers and settings are never deleted. Only routine logs age out.
 */
import { pool } from "@/db";

export async function cleanup() {
  const q = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  const out = {
    tasks: await q(`delete from tasks where status in ('done','failed','cancelled') and coalesce(finished_at, created_at) < now() - interval '7 days'`),
    routineEvents: await q(`delete from events where importance = 'all' and ts < now() - interval '30 days'
                              and type not in ('application_submitted','submission_confirmed','interview_detected','employer_response')`),
    oldEvents: await q(`delete from events where ts < now() - interval '400 days'`),
    pushLog: await q(`delete from push_deliveries where sent_at < now() - interval '60 days'`),
    sessions: await q(`delete from sessions where (revoked_at is not null or expires_at < now()) and created_at < now() - interval '30 days'`),
    // closed listings you never acted on: keep 6 months for duplicate detection, then drop the long description text
    oldDescriptions: await q(`update jobs set description = null where listing_status in ('closed','hidden') and description is not null
                                and coalesce(closed_at, updated_at) < now() - interval '180 days'
                                and not exists (select 1 from applications a where a.job_id = jobs.id)`),
  };
  return out;
}
