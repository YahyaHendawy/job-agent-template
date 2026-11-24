import { pool } from "@/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** New activity events since an id (polled by open screens every few seconds). */
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  const r = await pool.query(
    `select id, ts, type, level, title, body, url, simulated from events where id > $1 order by id asc limit 100`, [since]);
  return Response.json(r.rows.map((e) => ({ ...e, id: Number(e.id) })), { headers: { "Cache-Control": "no-store" } });
}
