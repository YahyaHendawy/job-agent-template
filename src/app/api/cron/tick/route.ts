import { after } from "next/server";
import { secret as secret_ } from "@/lib/keys";
import { timingSafeEqual } from "node:crypto";
import { drain } from "@/worker/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request) {
  const secret = secret_("CRON_SECRET");
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Wakes the agent. Called every 10 minutes by the database scheduler (Supabase pg_cron + pg_net)
 * and daily by Vercel Cron as a backup. Responds immediately; the work continues in the background.
 */
async function handle(req: Request) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  after(async () => {
    try { await drain(`tick-${Date.now().toString(36)}`, 270_000); }
    catch (e) { console.error("[tick] drain failed", e); }
  });
  return Response.json({ ok: true, started: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
