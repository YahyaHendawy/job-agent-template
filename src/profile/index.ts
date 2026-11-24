import { pool } from "@/db";
import { loadPersona } from "@/lib/persona";

export type Profile = {
  name: string;
  legalName?: string;
  nationality: string;
  residencies: { country: string; status: string; source: string; needsVerification?: boolean }[];
  contact: Record<string, string>;
  languages: string[];
  education: any[];
  experience: any[];
  leadership: any[];
  projects: { name: string; summary: string; source: string; individualContributionNeedsVerification?: boolean }[];
  skills: { verified: string[]; userStated: string[] };
  memberships: { name: string; dates: string }[];
  activities: string[];
  interests: string[];
  markets: string[];
  openQuestions: string[];
};

let cache: { at: number; p: Profile } | null = null;

export async function getProfile(): Promise<Profile | null> {
  await loadPersona(); // matching, answers and verdicts that use the profile also read the persona
  if (cache && Date.now() - cache.at < 60_000) return cache.p;
  const r = await pool.query(`select data from profile where id = 1`);
  if (!r.rows[0]) return null;
  cache = { at: Date.now(), p: r.rows[0].data };
  return cache.p;
}
