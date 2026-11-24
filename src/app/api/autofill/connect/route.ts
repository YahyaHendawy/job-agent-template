import { currentUser, assertSameOrigin, createApiToken } from "@/lib/auth";
import { audit, emit } from "@/lib/events";

/** Called from Settings → Connect this Mac. The token is shown once to the extension and never stored in plain text. */
export async function POST(req: Request) {
  try { await assertSameOrigin(req); } catch (r) { return r as Response; }
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const ua = req.headers.get("user-agent") ?? "";
  const label = `Safari autofill · ${/Macintosh/.test(ua) ? "Mac" : "browser"} · ${new Date().toISOString().slice(0, 10)}`;
  const token = await createApiToken(u.id, label);
  await audit("autofill_connected", { label }, u.id);
  await emit({ type: "security", title: "Safari autofill connected", body: label, push: false });
  return Response.json({ token, label });
}
