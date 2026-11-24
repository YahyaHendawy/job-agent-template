import { currentUser, assertSameOrigin } from "@/lib/auth";
import { emit } from "@/lib/events";
import { deliverEvent } from "@/lib/push";

export async function POST(req: Request) {
  try { await assertSameOrigin(req); } catch (r) { return r as Response; }
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const id = await emit({
    type: "test_notification", level: "success", title: "✅ Notifications are working",
    body: "You'll only hear from me when you need to do something. Nothing to do now.", url: "/settings", push: false,
  });
  try {
    const r = await deliverEvent(id);
    return Response.json(r);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
