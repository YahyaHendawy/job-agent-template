/**
 * "My job": managing an opportunity once an offer arrives — deciding, replying, getting ready, the role itself
 * (hours within visa limits, a work journal) and finishing well. Stored in the application's notes
 * (notes.opportunity) plus a small log table for hours and journal entries. Persona-aware for other people's copies.
 */
import { pool } from "@/db";
import { persona, isUkStudent } from "@/lib/persona";
import { readNotes } from "@/lib/goahead";

export type OppState = "considering" | "accepted" | "started" | "finished" | "declined";
export type Opp = {
  state: OppState; pay?: string; hours?: number; start?: string; end?: string; respondBy?: string; address?: string;
  manager?: string; managerEmail?: string; contract?: boolean; notes?: string; checklist?: string[]; decidedAt?: string;
};
export const STATE_LABEL: Record<OppState, string> = { considering: "Deciding", accepted: "Accepted", started: "In the role", finished: "Finished", declined: "Declined" };
export const STATE_ORDER: OppState[] = ["considering", "accepted", "started", "finished"];

export const oppOf = (notes: string | null): Opp => ({ state: "considering", ...(readNotes(notes).opportunity ?? {}) });
const DAY = 86_400_000;
export const daysUntil = (d?: string | null) => (d ? Math.ceil((Date.parse(`${d}T00:00:00`) - Date.now()) / DAY) : null);
export const fmtDay = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "");

let ready = false;
export async function ensureLog() {
  if (ready) return;
  await pool.query(`create table if not exists opportunity_log (id bigserial primary key, application_id uuid not null, kind text not null, day date not null, hours numeric, text text, created_at timestamptz not null default now())`);
  await pool.query(`create index if not exists opportunity_log_app on opportunity_log (application_id, kind, day)`);
  ready = true;
}

/** Monday of the week containing this day (YYYY-MM-DD). */
export const mondayOf = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

/** Is this week inside the summer vacation you entered (full-time work allowed on a Student visa)? */
export function inVacation(monday: string, det: Record<string, any>) {
  const a = det.earliestStartSummer, b = det.latestEndSummer;
  if (!a || !b) return null; // unknown
  const sunday = new Date(Date.parse(`${monday}T12:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  return monday >= a && sunday <= b;
}

/** Hourly rate from text like "£12.50 per hour" / "£12.50/hr"; yearly salaries are left alone. */
export const hourlyRate = (pay?: string | null) => { const m = (pay ?? "").match(/£\s?(\d+(?:\.\d+)?)\s*(?:\/|per|an|a)\s*(?:h\b|hr|hour)/i); return m ? Number(m[1]) : null; };

export type Check = { tone: "good" | "warn" | "bad"; text: string; href?: string };
/** Worked from the UK (UK, unknown or remote): UK visa and payroll rules apply. Only clearly-abroad jobs are exempt. */
export const inUk = (country: string | null) => !country || ["UK", "OTHER", "REMOTE"].includes(country);

/** Things to check before saying yes, from your visa, dates, pay and the offer itself. */
export function checks(job: { category: string | null; country: string | null }, o: Opp, det: Record<string, any>): Check[] {
  const P = persona();
  const uni = P.universityShort || "your university";
  const out: Check[] = [];
  const left = daysUntil(o.respondBy);
  if (o.state === "considering") {
    if (left != null) out.push({ tone: left <= 2 ? "bad" : "warn", text: left < 0 ? "Their reply date has passed: answer today and apologise for the delay" : `Reply by ${fmtDay(o.respondBy)} (${left === 0 ? "today" : left === 1 ? "tomorrow" : `${left} days`})` });
    else out.push({ tone: "warn", text: "No reply date saved: check the offer email and add it below" });
  }
  if (isUkStudent() && inUk(job.country)) {
    const H = P.visa.termHours;
    if (job.category === "placement") out.push({ tone: "warn", text: `A placement year must be an approved part of your course: get ${uni}'s placement approval before you accept` });
    else if (o.hours != null && o.hours > H) {
      const allVac = o.start && o.end && det.earliestStartSummer && det.latestEndSummer && o.start >= det.earliestStartSummer && o.end <= det.latestEndSummer;
      out.push(allVac ? { tone: "good", text: `${o.hours} h/week is fine: the whole role is inside your summer vacation` }
        : { tone: "bad", text: `${o.hours} h/week is over your ${H} h/week term-time limit. Only official vacation weeks can be full-time: agree term-time hours of ${H} or fewer, or check the dates` });
    } else if (o.hours != null) out.push({ tone: "good", text: `${o.hours} h/week is within your ${H} h/week term-time limit` });
    else out.push({ tone: "warn", text: `Hours not saved yet: in term time you can work up to ${H} h/week` });
    const exp = [det.visaExpiry, P.visa.expiry].find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? ""));
    if (exp && o.end && o.end > exp) out.push({ tone: "bad", text: `It ends after your visa expires (${fmtDay(exp)}): you can't work past that date` });
    out.push({ tone: "warn", text: "Before signing: check the dates and hours against your visa in your UKVI account, and ask your university if unsure", href: "https://www.gov.uk/student-visa/work" });
  }
  if (!o.pay) out.push({ tone: "warn", text: "Pay not saved: make sure it's in writing before you accept" });
  else out.push({ tone: "good", text: `Pay: ${o.pay}. Check it's at least the minimum wage for your age`, href: "https://www.gov.uk/national-minimum-wage-rates" });
  if (!o.contract && o.state !== "declined") out.push({ tone: "warn", text: "No written contract yet: don't turn down other offers until you have it in writing" });
  return out;
}

export type Item = { id: string; title: string; why: string; href?: string };

/** Getting ready to start. */
export function prepItems(id: string, job: { category: string | null; country: string | null }, o: Opp): Item[] {
  const P = persona();
  const uni = P.universityShort || "your university";
  const uk = inUk(job.country);
  const items: Item[] = [
    { id: "contract", title: "Get the offer in writing and sign the contract", why: "Check pay, hours, dates, place and notice period match what you agreed." },
    ...(uk && isUkStudent() ? [{ id: "rtw", title: "Prove your right to work with a share code", why: "Employers must check it before you start. Get a share code online in a few minutes.", href: "https://www.gov.uk/prove-right-to-work" }] : []),
    ...(uk ? [{ id: "ni", title: "Have your National Insurance number ready", why: "Needed to be paid and taxed correctly. Apply online if you don't have one.", href: "https://www.gov.uk/apply-national-insurance-number" }] : []),
    ...(P.university ? [{ id: "uni", title: job.category === "placement" ? `Get your placement approved by ${uni}` : `Tell ${uni} (careers or placement team)`, why: job.category === "placement" ? "Placement agreements and health-and-safety forms are needed before you start." : "They can check it fits your course and visa, and support you." }] : []),
    ...(uk ? [{ id: "payroll", title: "Send your bank details and the HMRC starter checklist", why: "So your first pay arrives on time and you're on the right tax code.", href: "https://www.gov.uk/government/publications/paye-starter-checklist" }] : []),
    { id: "checks", title: "Complete any references, background or DBS checks they ask for", why: "Delays here can push back your start date." },
    { id: "others", title: "Withdraw your other applications politely", why: "Saves everyone time and keeps a good impression with those employers.", href: "#others" },
    { id: "day1", title: "Plan day one: address, start time, who to ask for, dress code and route", why: "Do a trial journey if you can and aim to arrive 10 minutes early.", href: o.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address)}` : undefined },
    { id: "calendar", title: "Add your start date to your calendar", why: "With reminders the day before.", href: o.start ? `/api/work/${id}/ics` : undefined },
    { id: "read", title: "Read anything they send (handbook, IT set-up) and reply to confirm", why: "Shows you're organised before you even start." },
  ];
  return items;
}

/** Finishing well: the things that turn a job into a reference, a return offer and a stronger CV. */
export const finishItems: Item[] = [
  { id: "ref", title: "Ask your manager for a reference", why: "Ask before you leave, while your work is fresh in their mind." },
  { id: "linkedin", title: "Ask for a LinkedIn recommendation and add the role to LinkedIn", why: "Recruiters see it, and it backs up your CV.", href: "https://www.linkedin.com/in/me/edit/forms/position/new/" },
  { id: "return", title: "Ask about a return offer or graduate scheme", why: "Many firms hire their interns and placement students first." },
  { id: "cv", title: "Add the role to your CV using your journal", why: "Specific results you wrote down beat vague bullet points.", href: "#cv" },
  { id: "thanks", title: "Send a short thank-you to your manager and team", why: "Keeps the door open for later." },
];

/** Reminders for the agent's schedule: reply-by date, start date, first day, weekly hours, end of the role. */
export async function opportunityReminders(enqueue: (type: string, payload: Record<string, unknown>, opts: { dedupeKey: string }) => Promise<unknown>, emit: (e: any) => Promise<unknown>) {
  const rows = (await pool.query(`select a.id, a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.notes like '%"opportunity"%'`)).rows;
  if (!rows.length) return;
  await ensureLog();
  const P = persona();
  const tz = P.timeZone || "Europe/London";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }));
  const weekday = new Date().toLocaleDateString("en-GB", { timeZone: tz, weekday: "short" });
  const once = async (key: string, e: any) => { if (await enqueue("noop", {}, { dedupeKey: key })) await emit(e); };
  for (const r of rows) {
    const o = oppOf(r.notes);
    const url = `/work/${r.id}`;
    const respond = daysUntil(o.respondBy), start = daysUntil(o.start), end = daysUntil(o.end);
    if (o.state === "considering" && respond != null && (respond === 2 || respond === 0) && hour >= 9)
      await once(`opp:${r.id}:respond:${respond}`, { type: "deadline_approaching", level: "warning", importance: "urgent", title: respond === 0 ? `⏰ Reply to ${r.employer}'s offer today` : `⏰ ${r.employer}'s offer: reply in 2 days`, body: `${r.title}\n👉 Tap to check it against your visa and reply.`, applicationId: r.id, url });
    if (o.state === "accepted" && start != null && (start === 7 || start === 1) && hour >= 9) {
      const left = prepItems(r.id, { category: null, country: null }, o).filter((i) => !(o.checklist ?? []).includes(i.id)).length;
      await once(`opp:${r.id}:start:${start}`, { type: "deadline_approaching", level: "info", importance: "important", title: start === 1 ? `🚀 You start at ${r.employer} tomorrow` : `🚀 One week until you start at ${r.employer}`, body: `${r.title}${left ? `\n👉 ${left} thing${left > 1 ? "s" : ""} left on your getting-ready list.` : "\n👉 You're all set. Plan your route tonight."}`, applicationId: r.id, url });
    }
    if (o.state === "accepted" && start != null && start <= 0) {
      await setOpp(r.id, { state: "started" });
      await once(`opp:${r.id}:day1`, { type: "employer_response", level: "success", importance: "important", title: `💼 First day at ${r.employer}. Good luck!`, body: "👉 Tap for your day-one notes. Log your hours and a line in your journal each week.", applicationId: r.id, url });
    }
    if (o.state === "started" && weekday === "Sun" && hour >= 18) {
      const has = (await pool.query(`select 1 from opportunity_log where application_id = $1 and kind = 'hours' and day = $2`, [r.id, mondayOf(today)])).rowCount;
      if (!has) await once(`opp:${r.id}:hours:${mondayOf(today)}`, { type: "info_needed", level: "info", importance: "important", title: `🕒 Log this week's hours at ${r.employer}`, body: isUkStudent() ? `👉 Keeps you within your ${P.visa.termHours} h/week term-time limit, and a line for your journal.` : "👉 And a line for your journal: it becomes your CV later.", applicationId: r.id, url: `${url}#hours` });
    }
    if (o.state === "started" && end != null && end < 0) {
      await setOpp(r.id, { state: "finished" });
      await once(`opp:${r.id}:finished`, { type: "employer_response", level: "success", importance: "important", title: `🏁 Your role at ${r.employer} has ended`, body: "👉 Ask for a reference, add it to LinkedIn and your CV while it's fresh.", applicationId: r.id, url: `${url}#finish` });
    }
  }
}

/** Merge changes into notes.opportunity. */
export async function setOpp(appId: string, patch: Partial<Opp>) {
  const r = await pool.query(`select notes from applications where id = $1`, [appId]);
  const n = readNotes(r.rows[0]?.notes ?? null);
  const opportunity = { state: "considering", ...(n.opportunity ?? {}), ...patch };
  await pool.query(`update applications set notes = $2, updated_at = now() where id = $1`, [appId, JSON.stringify({ ...n, opportunity })]);
  return opportunity as Opp;
}
