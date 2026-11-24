/** Standard Web Push (VAPID). Works with iOS 16.4+ Home Screen web apps, Android, desktop browsers. */
import * as webpush from "web-push";
import { vapidKeys } from "./keys";
import { pool } from "@/db";
import { getSettings } from "./settings";
import { ACTION_TYPES } from "./events";

let configured = false;
export function pushConfigured() {
  if (configured) return true;
  const v = vapidKeys(); const pub = v?.publicKey, priv = v?.privateKey;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", pub, priv);
  configured = true;
  return true;
}

const allowed = (mode: string, importance: string, type: string) =>
  mode === "action" ? ACTION_TYPES.has(type as any)
  : mode === "all" ? true : mode === "important" ? importance !== "all" : importance === "urgent";

export type DeliveryResult = { sent: number; skipped: string | null; failed: number };

export async function deliverEvent(eventId: number): Promise<DeliveryResult> {
  if (!pushConfigured()) return { sent: 0, skipped: "push not configured", failed: 0 };
  const ev = (await pool.query(`select * from events where id = $1`, [eventId])).rows[0];
  if (!ev) return { sent: 0, skipped: "event missing", failed: 0 };
  const { notifications } = await getSettings();
  if (!allowed(notifications.mode, ev.importance, ev.type)) return { sent: 0, skipped: `mode ${notifications.mode}`, failed: 0 };

  if (ev.importance === "all") {
    const recent = await pool.query(
      `select count(distinct d.event_id)::int n from push_deliveries d join events e on e.id = d.event_id
       where d.status = 'sent' and e.importance = 'all' and d.sent_at > now() - interval '10 minutes'`);
    if (recent.rows[0].n >= notifications.maxAllPer10Min) return { sent: 0, skipped: "rate limited", failed: 0 };
  }

  const subs = (await pool.query(`select * from push_subscriptions where failures < 5`)).rows;
  const badge = (await pool.query(`select count(*)::int n from applications where status = 'awaiting_approval'`)).rows[0].n;
  const payload = JSON.stringify({
    title: ev.title,
    body: ev.body ?? "",
    url: ev.url ?? "/activity",
    tag: ev.type === "employer_checked" ? "employer_checked" : `ev-${ev.id}`,
    eventId: ev.id,
    ts: ev.ts,
    badge,
  });
  let sent = 0, failed = 0;
  for (const s of subs) {
    const already = await pool.query(`select 1 from push_deliveries where event_id = $1 and subscription_id = $2`, [ev.id, s.id]);
    if (already.rowCount) continue; // idempotent across retries
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: 60 * 60 * 24, urgency: ev.importance === "urgent" ? "high" : "normal",
      });
      await pool.query(`insert into push_deliveries (event_id, subscription_id, status) values ($1,$2,'sent') on conflict do nothing`, [ev.id, s.id]);
      await pool.query(`update push_subscriptions set last_success_at = now(), failures = 0 where id = $1`, [s.id]);
      sent++;
    } catch (e: any) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) {
        await pool.query(`delete from push_subscriptions where id = $1`, [s.id]); // expired subscription
      } else {
        await pool.query(`update push_subscriptions set failures = failures + 1 where id = $1`, [s.id]);
        throw e; // let the task retry
      }
    }
  }
  return { sent, skipped: subs.length ? null : "no subscribed devices", failed };
}
