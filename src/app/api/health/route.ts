import { pool } from "@/db";

export const dynamic = "force-dynamic";

/** Public health check for uptime monitoring. Reveals no personal data. */
export async function GET() {
  try {
    const r = await pool.query(`select worker_heartbeat_at, status, emergency_stop from agent_state where id = 1`);
    const s = r.rows[0];
    const age = s?.worker_heartbeat_at ? Math.round((Date.now() - new Date(s.worker_heartbeat_at).getTime()) / 1000) : null;
    const workerOk = age !== null && age < Number(process.env.HEARTBEAT_STALE_SEC ?? 1500);
    return Response.json({ ok: workerOk, db: "ok", workerHeartbeatAgeSec: age, agent: s?.emergency_stop ? "stopped" : s?.status }, { status: workerOk ? 200 : 503 });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
