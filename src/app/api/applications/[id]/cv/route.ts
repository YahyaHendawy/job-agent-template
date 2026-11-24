import { pool } from "@/db";
import { currentUser } from "@/lib/auth";
import { cvPdf } from "@/lib/cvpdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await pool.query(`select a.cv_markdown, (select data->>'name' from profile where id = 1) as name from applications a where a.id = $1`, [id]);
  const row = r.rows[0];
  if (!row?.cv_markdown) return new Response("CV not ready", { status: 404 });
  const name = (row.name ?? "CV").replace(/[^A-Za-z ]/g, "").trim();
  const bytes = await cvPdf(row.cv_markdown, `${name} - CV`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/ /g, "_")}_CV.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
