import { z } from "zod";
import { pool } from "@/db";
import { currentUser, assertSameOrigin } from "@/lib/auth";
import { audit, emit } from "@/lib/events";

const Sub = z.object({ endpoint: z.string().url().startsWith("https://"), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(8) }) });

export async function POST(req: Request) {
  try { await assertSameOrigin(req); } catch (r) { return r as Response; }
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid subscription", { status: 400 });
  const { endpoint, keys } = parsed.data;
  const ua = req.headers.get("user-agent");
  const r = await pool.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failures = 0
     returning (xmax = 0) as inserted`,
    [u.id, endpoint, keys.p256dh, keys.auth, ua]);
  if (r.rows[0]?.inserted) {
    await audit("push_subscribed", { host: new URL(endpoint).host }, u.id);
    await emit({ type: "security", title: "Notifications enabled on a device", body: new URL(endpoint).host, push: false });
  }
  return Response.json({ ok: true });
}
