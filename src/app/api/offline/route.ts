import { pool } from "@/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Screens worth keeping on the device for offline use: everything you might need to act on. */
export async function GET() {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const [apps, mail] = await Promise.all([
    pool.query(`select a.id, a.job_id from applications a
                where a.status in ('draft','preparing','awaiting_approval','approved','submitted','assessment','interview','offer')
                order by (a.status in ('interview','offer','assessment','awaiting_approval')) desc, a.updated_at desc limit 30`),
    pool.query(`select id from emails where needs_action and handled_at is null order by received_at desc limit 10`),
  ]);
  const urls = [
    ...apps.rows.flatMap((a) => [`/applications/${a.id}`, `/jobs/${a.job_id}`]),
    ...mail.rows.map((e) => `/emails/${e.id}`),
    "/settings", "/applications?tab=approval",
  ];
  return Response.json({ urls }, { headers: { "Cache-Control": "no-store" } });
}
