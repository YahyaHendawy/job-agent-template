import { z } from "zod";
import { pool } from "@/db";
import { tokenUser, CORS } from "@/lib/auth";
import { emit, audit } from "@/lib/events";

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

const Body = z.object({ applicationId: z.string().uuid(), url: z.string().url(), title: z.string().max(300), confirmationText: z.string().max(500) });

/** The extension saw the employer's confirmation page after the owner pressed Submit themselves: record it as evidence. */
export async function POST(req: Request) {
  const u = await tokenUser(req);
  if (!u) return Response.json({ error: "Not connected" }, { status: 401, headers: CORS });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Bad request" }, { status: 400, headers: CORS });
  const { applicationId, url, title, confirmationText } = p.data;
  const r = await pool.query(
    `update applications set status = 'submitted', submitted_at = now(), updated_at = now(),
       submission_evidence = $2 where id = $1 and status in ('awaiting_approval','approved') returning id`,
    [applicationId, JSON.stringify({ kind: "confirmation_page", reference: `${title} — ${url}`, text: confirmationText, at: new Date().toISOString() })]);
  if (r.rowCount) {
    await audit("submission_confirmed_by_extension", { applicationId, host: new URL(url).host }, u.id);
    const j = (await pool.query(`select j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [applicationId])).rows[0];
    await emit({ type: "submission_confirmed", level: "success", title: `Submitted: ${j?.title} — ${j?.employer}`, body: `Confirmation page seen: “${confirmationText.slice(0, 120)}”`, applicationId, push: false });
  }
  return Response.json({ ok: true, recorded: !!r.rowCount }, { headers: CORS });
}
