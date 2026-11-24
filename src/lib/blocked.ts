import { pool } from "@/db";
/**
 * Optional employer block list (switched on in onboarding or Settings → Blocked employers). The suggested
 * starting list covers Israeli companies, IDF suppliers and American defence companies. Matching is by
 * whole words, case-insensitive. The owner can add or remove names.
 */
export const DEFAULT_BLOCKED: string[] = [
  // American defence & intelligence contractors
  "Palantir", "Anduril", "Lockheed Martin", "Raytheon", "RTX", "Northrop Grumman", "General Dynamics", "L3Harris", "Leidos",
  "Boeing Defense", "Textron", "Huntington Ingalls", "Science Applications International", "CACI", "Booz Allen", "Peraton", "Sierra Nevada", "Kratos",
  "AeroVironment", "Oshkosh Defense", "BAE Systems Inc", "Shield AI", "Epirus", "Saronic", "Hadrian Automation", "Castelion", "SpaceX",
  // Israeli defence / IDF suppliers
  "Elbit", "Rafael", "Israel Aerospace", "IAI", "IMI Systems", "UVision", "Xtend", "Smart Shooter", "NSO Group",
  "Cellebrite", "Candiru", "Paragon Solutions",
  // Israeli companies
  "Check Point", "CyberArk", "Wix", "monday.com", "Mobileye", "Teva", "Fiverr", "Payoneer", "Taboola", "Outbrain", "Gong.io",
  "Riskified", "Lemonade", "Amdocs", "NICE Ltd", "NICE Systems", "Similarweb", "JFrog", "Playtika", "Moon Active", "ironSource",
  "Lightricks", "Cato Networks", "Armis", "Pagaya", "Hibob", "Papaya Global", "Rapyd", "Melio", "Tipalti", "Navan",
  "AppsFlyer", "Varonis", "SolarEdge", "Valens", "Tower Semiconductor", "Nova Ltd", "Camtek", "Orbotech", "Kornit",
  "Stratasys", "Sapiens", "Radware", "Ceragon", "Gilat", "Elbit Imaging", "Israel Chemicals", "ICL Group", "Strauss Group",
  "SodaStream", "Ormat", "Perion", "Verint", "Cognyte", "Snyk", "Wiz",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True if the employer name matches any blocked name as whole words. */
export function isBlockedEmployer(employer: string, list: string[]): boolean {
  const e = employer ?? "";
  return list.some((b) => b.trim() && new RegExp(`(^|[^a-z0-9])${esc(b.trim())}($|[^a-z0-9])`, "i").test(e));
}

/** Same rule as a Postgres regex (used in SQL filters). */
export const blockedSqlPattern = (b: string) => `(^|[^a-z0-9])${esc(b.trim())}($|[^a-z0-9])`;

/** The live list (Settings → Blocked employers), falling back to the defaults above. */
export async function getBlocked(): Promise<string[]> {
  const { loadPersona } = await import("@/lib/persona");
  if (!(await loadPersona()).filters.blocklist) return [];
  const r = await pool.query(`select value from settings where key = 'blockedEmployers'`);
  const v = r.rows[0]?.value;
  return Array.isArray(v) && v.length ? v : DEFAULT_BLOCKED;
}

/** The saved list, whether or not the filter is switched on (for Settings). */
export async function getBlockedList(): Promise<string[]> {
  const r = await pool.query(`select value from settings where key = 'blockedEmployers'`);
  const v = r.rows[0]?.value;
  return Array.isArray(v) && v.length ? v : DEFAULT_BLOCKED;
}

/** One Postgres regex for the whole list (empty list → matches nothing). */
export const blockedRegex = (list: string[]) =>
  list.filter((b) => b.trim()).length ? `(^|[^a-z0-9])(${list.filter((b) => b.trim()).map((b) => esc(b.trim())).join("|")})($|[^a-z0-9])` : "$^";

/** Hides blocked employers' jobs and removes their not-yet-submitted applications. */
export async function applyBlocklist(list: string[]) {
  const re = blockedRegex(list);
  const apps = await pool.query(`delete from applications a using jobs j where j.id = a.job_id and j.employer ~* $1
    and a.status in ('draft','preparing','awaiting_approval','approved','failed') returning a.id`, [re]);
  const jobs = await pool.query(`update jobs set dismissed = true, listing_status = 'hidden', updated_at = now(),
    notes = coalesce(notes, '') || ' [blocked employer]' where employer ~* $1 and listing_status <> 'hidden' returning id`, [re]);
  return { applicationsRemoved: apps.rowCount ?? 0, jobsHidden: jobs.rowCount ?? 0 };
}
