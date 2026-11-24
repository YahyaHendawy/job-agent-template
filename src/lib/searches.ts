/**
 * Saved job-board searches built from the owner's onboarding answers: for every target country and
 * keyword, a Reed search (UK only) and a Jooble search (where Jooble has a portal), plus part-time
 * searches near the home city. They switch on by themselves once the matching free key is saved.
 */
import { pool } from "@/db";
import { COUNTRIES, type Persona } from "@/lib/persona";

export type Search = { kind: "reed" | "jooble"; name: string; config: Record<string, unknown> };

export function searchesFor(p: Persona): Search[] {
  const out: Search[] = [];
  const kws = [...new Set(p.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 8);
  const wantsPartTime = p.jobTypes.includes("part_time") || p.jobTypes.includes("temporary");
  for (const m of p.markets) {
    const c = COUNTRIES[m.code];
    if (!c) continue;
    const place = m.code === p.home.country && p.home.city ? p.home.city : c.name;
    for (const k of kws) {
      if (m.code === "UK") out.push({ kind: "reed", name: `${k} (UK)`, config: { keywords: k } });
      if (c.jooble) out.push({ kind: "jooble", name: `${c.name}: ${k}`, config: { country: m.code, keywords: k, location: c.name } });
    }
    if (wantsPartTime && m.code === p.home.country && p.home.city) {
      if (m.code === "UK") {
        out.push({ kind: "reed", name: `Part-time student jobs (${place})`, config: { keywords: "student", location: place, distance: 8, partTime: true } });
        out.push({ kind: "reed", name: `Temporary vacation work (${place})`, config: { keywords: "temporary seasonal", location: place, distance: 8, temp: true } });
      }
      if (c.jooble) out.push({ kind: "jooble", name: `${place}: part-time student jobs`, config: { country: m.code, keywords: "part time student", location: place } });
    }
  }
  return out;
}

/** Adds any missing searches (never removes or edits existing ones). Returns how many were added. */
export async function syncSearches(p: Persona): Promise<number> {
  const keys = (await pool.query(`select value from settings where key = 'apiKeys'`)).rows[0]?.value ?? {};
  const { joobleKeyName } = await import("@/connectors");
  let added = 0;
  for (const s of searchesFor(p)) {
    const enabled = s.kind === "reed" ? !!(process.env.REED_API_KEY || keys.reed) : !!keys[joobleKeyName(String(s.config.country))];
    const r = await pool.query(`insert into sources (kind, token, employer, sector, config, enabled) values ($1,$2,$3,'job board search',$4,$5) on conflict (kind, token) do nothing`,
      [s.kind, s.name.slice(0, 120), s.kind === "reed" ? "Reed.co.uk" : "Jooble", JSON.stringify(s.config), enabled]);
    added += r.rowCount ?? 0;
  }
  return added;
}
