/**
 * Recruiter / hiring contacts for an application — only ones that are genuinely published:
 * emails and names written in the advert, and people at the employer who have already emailed you.
 * Addresses are never guessed (guessed addresses bounce, and emailing a guessed personal address isn't OK).
 */
import { pool } from "@/db";

export type Contact = { email: string; name: string | null; source: "advert" | "their email"; note?: string };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SKIP = /^(no-?reply|do-?not-?reply|privacy|gdpr|dpo|data\.?protection|unsubscribe|support|help|accessibility|webmaster|abuse|postmaster|notifications?|alerts?|mailer-daemon)@|@(reed\.co\.uk|indeed\.|jooble|linkedin\.com|greenhouse\.io|lever\.co|workday|myworkday|smartrecruiters|ashbyhq|example\.)/i;

export async function findContacts(app: { id: string; description?: string | null; employer: string }): Promise<{ contacts: Contact[]; named: string[] }> {
  const out = new Map<string, Contact>();
  const desc = app.description ?? "";
  for (const m of desc.matchAll(EMAIL)) {
    const email = m[0].replace(/[.,;:)]+$/, "").toLowerCase();
    if (SKIP.test(email)) continue;
    const around = desc.slice(Math.max(0, m.index! - 120), m.index!).replace(/\s+/g, " ");
    const name = around.match(/(?:contact|email|send (?:your )?(?:cv|application)s? to|reach out to|speak to|questions[^.]{0,30}to)\s*:?\s*([A-Z][a-z]+(?: [A-Z][a-z'-]+){1,2})\s*(?:at|on|via|\(|,|-|$)/)?.[1] ?? null;
    const isApply = /send (your )?(cv|application)|apply (by|via) email|email your (cv|application)/i.test(around);
    out.set(email, { email, name, source: "advert", note: isApply ? "The advert says to apply by email to this address" : "Published in the advert" });
  }
  const r = await pool.query(`select distinct on (lower(from_address)) from_address, from_name, category, received_at from emails where application_id = $1 order by lower(from_address), received_at desc`, [app.id]);
  for (const e of r.rows) {
    const email = String(e.from_address ?? "").toLowerCase();
    if (!email || SKIP.test(email) || out.has(email)) continue;
    out.set(email, { email, name: e.from_name || null, source: "their email", note: `Emailed you (${e.category})` });
  }
  // Names mentioned as the hiring contact, even without an email (find them on LinkedIn)
  const named = [...desc.matchAll(/(?:recruiter|hiring manager|talent (?:acquisition|partner)|contact)\s*(?:is|:|-)\s*([A-Z][a-z]+ [A-Z][a-z'-]+)/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i).slice(0, 3);
  return { contacts: [...out.values()], named };
}
