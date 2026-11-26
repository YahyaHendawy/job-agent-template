import { currentUser } from "@/lib/auth";
import { getSource, getItems, buildDocx } from "@/lib/cvdoc";

export const dynamic = "force-dynamic";

/** Your CV as a Word file, in your own layout, with everything you've added. */
export async function GET() {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const src = await getSource();
  if (!src) return new Response("Upload your CV first", { status: 404 });
  const { docx } = buildDocx(src.data, await getItems());
  const name = src.filename.replace(/\.docx$/i, "").replace(/[^\w .&()-]+/g, "") || "CV";
  return new Response(new Uint8Array(docx), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${name}.docx"`, "Cache-Control": "private, no-store",
  } });
}
