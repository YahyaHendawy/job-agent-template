import { short } from "@/lib/notify-text";
import { z } from "zod";
import { pool } from "@/db";
import { tokenUser, CORS } from "@/lib/auth";
import { emit } from "@/lib/events";
import { keyOf } from "@/lib/written";

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

const Body = z.object({ applicationId: z.string().uuid(), questions: z.array(z.string().min(3).max(400)).max(20) });

/** The extension found personal questions on the real form: store them so the owner can answer them in the app (e.g. on their phone). */
export async function POST(req: Request) {
  const u = await tokenUser(req);
  if (!u) return Response.json({ error: "Not connected" }, { status: 401, headers: CORS });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Bad request" }, { status: 400, headers: CORS });
  const r = await pool.query(`select a.form_questions, a.written, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [p.data.applicationId]);
  const row = r.rows[0];
  if (!row) return Response.json({ error: "Not found" }, { status: 404, headers: CORS });
  const existing: { label: string }[] = row.form_questions ?? [];
  const added = p.data.questions.filter((q) => !existing.some((e) => keyOf(e.label) === keyOf(q)));
  if (added.length) {
    const next = [...existing, ...added.map((label) => ({ label, foundAt: new Date().toISOString() }))];
    await pool.query(`update applications set form_questions = $2, updated_at = now() where id = $1`, [p.data.applicationId, JSON.stringify(next)]);
    await emit({
      type: "info_needed", level: "info",
      title: `✍️ ${row.employer} needs ${added.length > 1 ? `${added.length} answers` : "an answer"} from you`,
      body: `${added.slice(0, 2).map((q) => `“${short(q, 70)}”`).join("\n")}${added.length > 2 ? `\n+${added.length - 2} more` : ""}\n👉 Tap to answer in your own words. Autofill uses them next time.`,
      applicationId: p.data.applicationId, url: `/applications/${p.data.applicationId}#answers`,
    });
  }
  return Response.json({ ok: true, added: added.length }, { headers: CORS });
}
