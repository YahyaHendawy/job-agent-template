import { assertSameOrigin, destroySession } from "@/lib/auth";

/** Sign out, and tell the browser to wipe the offline copies of your private pages and app storage. */
export async function POST(req: Request) {
  try { await assertSameOrigin(req); } catch (r) { return r as Response; }
  await destroySession();
  return new Response(null, { status: 303, headers: { Location: "/login", "Clear-Site-Data": '"cache", "storage"', "Cache-Control": "no-store" } });
}
