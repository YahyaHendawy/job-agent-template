/** Loads the verified profile and the default source list. Safe to re-run. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db";
if (process.env.VERCEL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL) { console.log("No database connected yet: skipping. Connect Supabase in Vercel → Storage, then Redeploy."); process.exit(0); }

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// Profile: private/profile.json (gitignored) or PROFILE_JSON env (base64) in production.
const fromEnv = (() => {
  try { const t = Buffer.from(process.env.PROFILE_JSON_B64 ?? "", "base64").toString("utf8"); JSON.parse(t); return t; } catch { return null; }
})(); // protected env values are not exported by `vercel env pull`, so fall back to the local file
const profileJson = fromEnv ?? (existsSync(p("../private/profile.json")) ? readFileSync(p("../private/profile.json"), "utf8") : null);
const cvText = existsSync(p("../private/cv.txt")) ? readFileSync(p("../private/cv.txt"), "utf8") : null;
if (profileJson) {
  await pool.query(
    `insert into profile (id, data, cv_text, cv_filename, updated_at) values (1, $1, $2, $3, now())
     on conflict (id) do update set data = excluded.data, cv_text = coalesce(excluded.cv_text, profile.cv_text),
       cv_filename = coalesce(excluded.cv_filename, profile.cv_filename), updated_at = now()`,
    [profileJson, cvText, cvText ? `${(JSON.parse(profileJson).name ?? "My").replace(/\s+/g, "_")}_CV.docx` : null],
  );
  console.log("Profile loaded.");
} else console.log("No profile found (private/profile.json) — skipping.");

// Employer boards verified live by scripts/probe-sources.ts
const verified = JSON.parse(readFileSync(p("./sources.verified.json"), "utf8")) as any[];
let n = 0;
// Very large boards with no UK student roles cost CPU on the free tier: kept but disabled.
const HEAVY_NON_UK = new Set(["spacex", "relativity", "lucidmotors", "dexterity", "veo"]);
for (const s of verified) {
  if (s.kind === "workday" || !s.total) continue;
  await pool.query(
    `insert into sources (kind, token, employer, sector, config, enabled) values ($1,$2,$3,$4,$5,$6)
     on conflict (kind, token) do update set employer = excluded.employer, sector = excluded.sector`,
    [s.kind, s.token, s.employer, s.sector, JSON.stringify(s.config ?? {}), !HEAVY_NON_UK.has(s.token)],
  );
  n++;
}

// Saved searches on official job-board APIs. New owners get theirs from onboarding (src/lib/searches.ts);
// an owner's own extra list can live in private/searches.json (gitignored), e.g. for a local seed.
const searches: { kind: string; name: string; config: any }[] = existsSync(p("../private/searches.json")) ? JSON.parse(readFileSync(p("../private/searches.json"), "utf8")) : [];
for (const s of searches) {
  const enabled = s.kind === "reed" ? !!process.env.REED_API_KEY : s.kind === "adzuna" ? !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) : false;
  await pool.query(
    `insert into sources (kind, token, employer, sector, config, enabled) values ($1,$2,$3,'job board search',$4,$5)
     on conflict (kind, token) do update set config = excluded.config, enabled = sources.enabled or excluded.enabled`,
    [s.kind, s.name, ({ reed: "Reed.co.uk", adzuna: "Adzuna", jooble: "Jooble", careerjet: "Careerjet" } as Record<string, string>)[s.kind], JSON.stringify(s.config), enabled],
  );
}
await pool.query(`insert into agent_state (id) values (1) on conflict do nothing`);
console.log(`${n} employer boards and ${searches.length} saved searches seeded.`);
await pool.end();
