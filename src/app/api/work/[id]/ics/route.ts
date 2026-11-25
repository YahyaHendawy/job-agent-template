import { pool } from "@/db";
import { currentUser } from "@/lib/auth";
import { oppOf } from "@/lib/opportunity";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

/** Calendar file for your first day (all-day, with reminders the day before and the morning of). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = (await pool.query(`select a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [id])).rows[0];
  const o = oppOf(row?.notes ?? null);
  if (!row || !o.start) return new Response("No start date saved", { status: 404 });
  const d = o.start.replace(/-/g, "");
  const next = new Date(Date.parse(`${o.start}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Job Agent//EN", "BEGIN:VEVENT",
    `UID:start-${id}@job-agent`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(`First day: ${row.title} — ${row.employer}`)}`,
    o.address ? `LOCATION:${esc(o.address)}` : "",
    `DESCRIPTION:${esc(`${o.manager ? `Ask for ${o.manager}. ` : ""}Open Job Agent → My job for your checklist.`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT12H", "ACTION:DISPLAY", "DESCRIPTION:First day tomorrow", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="first-day-${row.employer.replace(/[^a-z0-9]+/gi, "-")}.ics"` } });
}
