import { pool } from "@/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const q = async (sql: string) => (await pool.query(sql)).rows;
  const data = {
    exportedAt: new Date().toISOString(),
    profile: await q(`select data, updated_at from profile`),
    jobs: await q(`select * from jobs order by discovered_at`),
    applications: await q(`select * from applications order by created_at`),
    events: await q(`select * from events order by id`),
    sources: await q(`select * from sources`),
    settings: await q(`select * from settings`),
    auditLog: await q(`select * from audit_log order by id`),
  };
  await audit("data_export", {}, u.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="job-agent-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
