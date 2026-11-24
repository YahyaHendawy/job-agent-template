/**
 * What the app does by itself the moment the owner says "Yes, apply":
 *  1. reuses the owner's own earlier answers to the same questions (their words, never generated),
 *  2. checks the advert is still open,
 *  3. records the decision, and works out the remaining steps (shown as a checklist).
 */
import { pool } from "@/db";
import { emit } from "@/lib/events";
import { questionsFor, saveWritten, suggestionsFor } from "@/lib/written";

export type Notes = Record<string, any>;
export const readNotes = (n: string | null): Notes => { try { return n ? JSON.parse(n) : {}; } catch { return {}; } };

export async function setNote(appId: string, patch: Notes) {
  const r = await pool.query(`select notes from applications where id = $1`, [appId]);
  const next = { ...readNotes(r.rows[0]?.notes ?? null), ...patch };
  await pool.query(`update applications set notes = $2, updated_at = now() where id = $1`, [appId, JSON.stringify(next)]);
}

/** Copies answers the owner already wrote for identical questions on other applications. */
export async function reuseOwnAnswers(appId: string): Promise<number> {
  const a = (await pool.query(`select a.id, a.written, a.form_questions, j.title, j.employer, j.category from applications a join jobs j on j.id = a.job_id where a.id = $1`, [appId])).rows[0];
  if (!a) return 0;
  const have = new Set((a.written ?? []).map((w: any) => w.key));
  const need = questionsFor(a).filter((q) => !have.has(q.key) && !/why .*(this|work at)|why do you want/i.test(q.question)); // "why this employer" must be fresh
  if (!need.length) return 0;
  const others = (await pool.query(`select written from applications where id <> $1 and jsonb_array_length(coalesce(written, '[]'::jsonb)) > 0 order by updated_at desc`, [appId])).rows;
  let n = 0;
  for (const q of need) {
    let answer: string | null = null;
    for (const o of others) {
      const hit = (o.written ?? []).find((w: any) => w.key === q.key && w.answer?.trim());
      if (hit) { answer = hit.answer; break; }
    }
    if (!answer) answer = (await suggestionsFor(q.question, appId)).find((s: any) => s.score >= 0.85)?.answer ?? null; // same question worded slightly differently
    if (answer) { await saveWritten(appId, q.key, q.question, answer); n++; }
  }
  return n;
}

const CLOSED_RE = /no longer (accepting|available|open)|position (has been )?filled|job (is |has )?(closed|expired)|this (job|vacancy|role) (is )?(no longer|has (been )?closed)|applications? (are |is )?(now )?closed/i;

/** Fetches the advert to check it's still open. */
export async function checkAdvert(url: string | null): Promise<{ ok: boolean | null; note: string }> {
  if (!url) return { ok: null, note: "No advert link to check" };
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12_000);
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (JobAgent personal checker)" } });
    clearTimeout(t);
    if (r.status === 404 || r.status === 410) return { ok: false, note: `The advert page is gone (${r.status})` };
    if (r.status >= 400) return { ok: null, note: `Couldn't check automatically (site answered ${r.status}); it's probably fine` };
    const text = (await r.text()).slice(0, 400_000);
    if (CLOSED_RE.test(text.replace(/<[^>]+>/g, " "))) return { ok: false, note: "The advert says applications are closed" };
    return { ok: true, note: "Advert checked: still open" };
  } catch {
    return { ok: null, note: "Couldn't reach the advert just now; it's probably fine" };
  }
}

/** Runs in the background right after "Yes, apply". */
export async function goAhead(appId: string) {
  const a = (await pool.query(`select a.id, j.id as job_id, j.title, j.employer, j.application_url from applications a join jobs j on j.id = a.job_id where a.id = $1`, [appId])).rows[0];
  if (!a) return;
  const [reused, advert] = await Promise.all([reuseOwnAnswers(appId), checkAdvert(a.application_url)]);
  await setNote(appId, { advertCheck: { ...advert, at: new Date().toISOString() }, reusedAnswers: reused });
  if (advert.ok === false) {
    await emit({ type: "info_needed", level: "warning", title: `⚠️ ${a.employer}: advert may be closed`,
      body: `${a.title}\n${advert.note}.\n👉 Tap to check the advert before spending time on it.`, applicationId: appId });
  } else {
    await emit({ type: "application_approved", level: "success", title: `✅ Going ahead: ${a.employer}`,
      body: `${reused ? `Reused ${reused} of your earlier answers. ` : ""}${advert.note}.`, applicationId: appId, push: false });
  }
}
