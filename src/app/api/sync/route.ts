import { after } from "next/server";
import { pool } from "@/db";
import { currentUser } from "@/lib/auth";
import { drain } from "@/worker/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tiny change-detection endpoint polled by every open screen.
 * Also a third way to keep the agent alive: if its scheduled wake-ups (Supabase every 10 min,
 * Vercel daily) ever stop, simply opening the app restarts it. At most one restart per 15 minutes.
 */
export async function GET() {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const r = await pool.query(
    `select (select coalesce(max(id), 0) from events)::bigint as latest,
            (select count(*)::int from applications where status = 'awaiting_approval') as approvals,
            (select updated_at from agent_state where id = 1) as state_at,
            (select worker_heartbeat_at < now() - interval '20 minutes' from agent_state where id = 1) as stale`);
  const row = r.rows[0];
  if (row.stale) {
    const claim = await pool.query(
      `insert into settings (key, value, updated_at) values ('selfKick', '{}', now())
       on conflict (key) do update set updated_at = now() where settings.updated_at < now() - interval '15 minutes' returning key`);
    if (claim.rowCount) after(async () => {
      try { await drain(`app-${Date.now().toString(36)}`, 270_000); } catch (e) { console.error("[sync] self-start failed", e); }
    });
  }
  return Response.json({ latest: Number(row.latest), approvals: row.approvals, stateAt: row.state_at }, { headers: { "Cache-Control": "no-store" } });
}
