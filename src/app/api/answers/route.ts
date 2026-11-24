import { z } from "zod";
import { pool } from "@/db";
import { currentUser, assertSameOrigin } from "@/lib/auth";
import { saveWritten } from "@/lib/written";

const Body = z.object({ items: z.array(z.object({
  appId: z.string().uuid(), key: z.string().min(1).max(200), question: z.string().max(1000),
  answer: z.string().max(5000), savedAt: z.string().datetime(),
})).max(100) });

/** Answers typed while offline arrive here once the device is back online. Newer saves always win. */
export async function POST(req: Request) {
  try { await assertSameOrigin(req); } catch (r) { return r as Response; }
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const done: string[] = [];
  for (const it of p.data.items) {
    const r = await pool.query(`select written from applications where id = $1`, [it.appId]);
    if (!r.rows[0]) { done.push(`${it.appId}:${it.key}`); continue; }
    const cur = (r.rows[0].written ?? []).find((w: { key: string }) => w.key === it.key);
    if (!cur || !cur.updatedAt || Date.parse(cur.updatedAt) <= Date.parse(it.savedAt)) await saveWritten(it.appId, it.key, it.question, it.answer);
    done.push(`${it.appId}:${it.key}`);
  }
  return Response.json({ ok: true, done });
}
