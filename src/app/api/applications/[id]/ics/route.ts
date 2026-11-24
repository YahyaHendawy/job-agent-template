import { pool } from "@/db";
import { persona, loadPersona } from "@/lib/persona";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
// datetime-local is the owner's local time; floating times with TZID keep it correct in any calendar.
const local = (v: string) => v.replace(/[-:]/g, "").slice(0, 13) + "00";

/** Calendar file for an interview (opens straight into Apple/Google/Outlook Calendar). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await loadPersona();
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const r = await pool.query(`select a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [id]);
  const row = r.rows[0];
  let n: any = {};
  try { n = JSON.parse(row?.notes ?? "{}"); } catch {}
  if (!row || !n.interviewAt) return new Response("No interview time saved", { status: 404 });
  const start = local(n.interviewAt);
  const endDate = new Date(n.interviewAt); endDate.setMinutes(endDate.getMinutes() + 60);
  const pad = (x: number) => String(x).padStart(2, "0");
  const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Job Agent//EN", "BEGIN:VEVENT",
    `UID:${id}@job-agent`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=${persona().timeZone}:${start}`, `DTEND;TZID=${persona().timeZone}:${end}`,
    `SUMMARY:${esc(`Interview: ${row.title} — ${row.employer}`)}`,
    n.interviewWhere ? `LOCATION:${esc(n.interviewWhere)}` : "",
    `DESCRIPTION:${esc("Prep: open Job Agent → this application for your notes and answers.")}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Interview tomorrow", "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Interview in 1 hour", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="interview-${row.employer.replace(/[^a-z0-9]+/gi, "-")}.ics"` } });
}
