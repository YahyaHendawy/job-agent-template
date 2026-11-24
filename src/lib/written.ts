/**
 * Personal answers the owner writes themselves in the app (never AI-generated). Questions come from the standard
 * prompts plus the real questions the Safari extension finds on each employer's form.
 */
import { pool } from "@/db";

export type Written = { key: string; question: string; answer: string; updatedAt: string };
export type Question = { key: string; question: string; guide?: string; source: "standard" | "form" };

const STOP = new Set("the a an to of and or for in on at with you your our we us is are be this that why what how do did have has it as from by about any please tell describe".split(" "));
export const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.min(A.size, B.size);
}
export const keyOf = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

export function questionsFor(app: { employer: string; form_questions?: any[] }): Question[] {
  const std: Question[] = [
    { key: "why", question: `Why do you want to work at ${app.employer} / in this role?`, guide: "2–4 sentences in your own words: what excites you about the work, plus one link to your interests.", source: "standard" },
    { key: "project", question: "Tell us about relevant experience or a project you're proud of", guide: "Pick ONE fact from your CV: what you did, how, and what you learned.", source: "standard" },
  ];
  const form: Question[] = (app.form_questions ?? []).map((f: any) => ({ key: keyOf(f.label), question: f.label, source: "form" as const }));
  // Real form questions replace a standard one when they're clearly the same question.
  const out = [...form];
  for (const s of std) if (!form.some((f) => similarity(f.question, s.question) >= 0.5 || (s.key === "why" && /\bwhy\b/i.test(f.question)))) out.push(s);
  return out;
}

/** Previous answers (from any application) that fit this question. */
export async function suggestionsFor(question: string, excludeAppId?: string) {
  const r = await pool.query(`select question, answer, updated_at from answer_bank order by updated_at desc limit 200`);
  return r.rows
    .map((x) => ({ ...x, score: similarity(question, x.question) }))
    .filter((x) => x.score >= 0.4 && x.answer.trim().length > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export async function saveWritten(appId: string, key: string, question: string, answer: string) {
  const r = await pool.query(`select written from applications where id = $1`, [appId]);
  if (!r.rows[0]) return;
  const list: Written[] = (r.rows[0].written ?? []).filter((w: Written) => w.key !== key);
  if (answer.trim()) list.push({ key, question, answer: answer.slice(0, 5000), updatedAt: new Date().toISOString() });
  await pool.query(`update applications set written = $2, updated_at = now() where id = $1`, [appId, JSON.stringify(list)]);
  if (answer.trim().length > 20) {
    // Keep a reusable copy (generic wording, employer name removed) for similar questions later.
    const employer = (await pool.query(`select j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [appId])).rows[0]?.employer ?? "";
    const generic = employer ? question.replace(new RegExp(employer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "the company") : question;
    const existing = (await pool.query(`select id, question from answer_bank`)).rows.find((x) => keyOf(x.question) === keyOf(generic));
    if (existing) await pool.query(`update answer_bank set answer = $2, updated_at = now(), verified = true where id = $1`, [existing.id, answer]);
    else await pool.query(`insert into answer_bank (question, answer, verified, tags) values ($1, $2, true, $3)`, [generic, answer, JSON.stringify([employer])]);
  }
}

/** Unanswered questions for an application (for the Needs-you list). */
export function unanswered(app: { employer: string; form_questions?: any[]; written?: Written[] }) {
  const written = app.written ?? [];
  return questionsFor(app).filter((q) => q.source === "form" && !written.some((w) => w.key === q.key && w.answer.trim()));
}
