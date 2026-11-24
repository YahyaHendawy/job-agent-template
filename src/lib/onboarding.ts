/**
 * Onboarding wizard state (settings key 'onboarding') and the final step that turns the answers into the
 * owner's persona, profile, application details and settings. Only facts the owner typed or ticked are
 * used: nothing is generated or guessed.
 */
import { pool } from "@/db";
import { FIELDS, COUNTRIES, BLANK_PERSONA, savePersona, type Persona, type Market } from "@/lib/persona";
import { saveDetails, getDetails } from "@/lib/details";
import { setSetting } from "@/lib/settings";
import { syncSearches } from "@/lib/searches";
import type { CvSuggestions } from "@/lib/cvparse";

export type Draft = {
  step?: number;
  cvText?: string; cvFilename?: string;
  suggestions?: CvSuggestions;
  facts?: { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; nationality?: string; languages?: string[];
    picked?: { kind: string; lines: string[] }[]; skills?: string[] };
  study?: { university?: string; universityShort?: string; degree?: string; field?: string; yearOfStudy?: string; gradYear?: number; placementGradYear?: number | null; summerYear?: number; summerWindow?: string };
  place?: { home?: string; city?: string; visa?: "uk_student" | "none"; visaExpiry?: string; termHours?: number; markets?: { code: string; rightToWork: Market["rightToWork"] }[]; remoteOk?: boolean; relocate?: string; timeZone?: string };
  jobs?: { types?: string[]; keywords?: string[] };
  details?: Record<string, string>;
  filters?: { halal?: boolean; blocklist?: boolean };
  notify?: { mode?: string; goal?: number };
};

export async function getDraft(): Promise<Draft> {
  const r = await pool.query(`select value from settings where key = 'onboarding'`);
  return r.rows[0]?.value ?? {};
}
export async function saveDraft(patch: Partial<Draft>) {
  const next = { ...(await getDraft()), ...patch };
  await pool.query(`insert into settings (key, value, updated_at) values ('onboarding', $1, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  return next;
}

const DATE_RE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\b(19|20)\d{2}\b\s*(–|-|to)\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\b(19|20)\d{2}\b|present|current|now)/i;

/** Groups ticked lines into entries: a line with a date range (or a short title line) starts a new entry. */
function entries(lines: string[]) {
  const out: { role: string; organisation: string; location: string; dates: string; bullets: string[]; source: "cv" }[] = [];
  for (const l of lines) {
    const d = l.match(DATE_RE)?.[0];
    const titleLike = d || (l.length < 70 && !/[.;]$/.test(l) && out.length === 0);
    if (titleLike || !out.length) {
      const rest = d ? l.replace(d, "").replace(/[|,–-]\s*$/, "").trim() : l;
      const [role, organisation = ""] = rest.split(/\s+(?:at|@|\||,|–|-)\s+/);
      out.push({ role: role.trim(), organisation: organisation.trim(), location: "", dates: d ?? "", bullets: [], source: "cv" });
    } else out[out.length - 1].bullets.push(l);
  }
  return out;
}

function projects(lines: string[]) {
  const out: { name: string; summary: string; source: "cv" }[] = [];
  for (const l of lines) {
    const m = l.match(/^([^:–-]{3,60})\s*[:–-]\s+(.+)$/);
    if (m) out.push({ name: m[1].trim(), summary: m[2].trim(), source: "cv" });
    else if (l.length < 60 && !/[.]$/.test(l)) out.push({ name: l, summary: "", source: "cv" });
    else if (out.length) out[out.length - 1].summary = `${out[out.length - 1].summary} ${l}`.trim();
    else out.push({ name: l.split(" ").slice(0, 5).join(" "), summary: l, source: "cv" });
  }
  return out.filter((p) => p.summary || p.name);
}

export function buildPersona(d: Draft): Persona {
  const field = FIELDS[d.study?.field ?? "general"] ?? FIELDS.general;
  const home = d.place?.home ?? "UK";
  const markets: Market[] = (d.place?.markets ?? []).filter((m) => COUNTRIES[m.code]).map((m) => ({
    code: m.code,
    rightToWork: m.code === "UK" && d.place?.visa === "uk_student" ? "visa" : m.rightToWork,
    ...(m.rightToWork === "unsure" ? { eligibilityLevel: "manual_verification" as const, eligibilityReason: `${COUNTRIES[m.code].name}: check your right to work there before applying.` } : {}),
    ...(m.rightToWork === "citizen" ? { answer: "Yes, I am a citizen." } : m.rightToWork === "full" ? { answer: "Yes, I have the full right to work." } : {}),
    ...(m.rightToWork === "resident" ? { eligibilityLevel: "potentially_eligible" as const, eligibilityReason: `${COUNTRIES[m.code].name}: you're a resident; the employer may need to arrange a work permit.`, answerNeedsYou: `${COUNTRIES[m.code].name}: confirm your residence permit lets you work` } : {}),
    ...(m.code !== home && m.rightToWork !== "unsure" && m.rightToWork !== "resident" ? { placeCon: `In ${COUNTRIES[m.code].name}: you'd need to move or travel for it` } : {}),
  }));
  if (!markets.some((m) => m.code === home)) markets.unshift({ code: home, rightToWork: d.place?.visa === "uk_student" && home === "UK" ? "visa" : "full" });
  const city = (d.place?.city ?? "").trim();
  return {
    ...BLANK_PERSONA,
    completed: true,
    university: d.study?.university ?? "", universityShort: d.study?.universityShort || d.study?.university || "your university",
    degreeSubject: field.degreeSubject || d.study?.degree || "", fieldName: field.fieldName,
    yearOfStudy: d.study?.yearOfStudy ?? "", gradYear: d.study?.gradYear ?? BLANK_PERSONA.gradYear,
    gradYearPlacement: d.study?.placementGradYear ?? null,
    summerYear: d.study?.summerYear ?? BLANK_PERSONA.summerYear, summerWindow: d.study?.summerWindow || "your summer break",
    visa: { preset: home === "UK" && d.place?.visa === "uk_student" ? "uk_student" : "none", expiry: d.place?.visaExpiry ?? "", termHours: d.place?.termHours ?? 20 },
    home: { country: home, city, cityMatch: home === "UK" && /^london$/i.test(city) ? "london" : "name" },
    markets, remoteOk: d.place?.remoteOk ?? true,
    interests: field.interests, skills: field.skills, technicalTitle: field.technicalTitle, fieldText: field.fieldText,
    degreeEvidence: field.degreeEvidence, offField: field.offField,
    relocate: d.place?.relocate ?? "", timeZone: d.place?.timeZone || "Europe/London",
    filters: { halal: !!d.filters?.halal, blocklist: !!d.filters?.blocklist },
    keywords: d.jobs?.keywords?.length ? d.jobs.keywords : field.keywords,
    jobTypes: d.jobs?.types?.length ? d.jobs.types : BLANK_PERSONA.jobTypes,
  };
}

export function buildProfile(d: Draft, p: Persona) {
  const f = d.facts ?? {};
  const picked = (kind: string) => (f.picked ?? []).filter((x) => x.kind === kind).flatMap((x) => x.lines);
  const city = p.home.city;
  return {
    name: f.name ?? "", nationality: f.nationality ?? "", residencies: [],
    contact: { email: f.email ?? "", phone: f.phone ?? "", linkedin: (f.linkedin ?? "").replace(/^https?:\/\//, ""), location: [city, COUNTRIES[p.home.country]?.name].filter(Boolean).join(", "), ...(f.github ? { github: f.github } : {}) },
    languages: f.languages ?? [],
    education: [{ institution: p.university, location: city, degree: d.study?.degree ?? "", year: p.yearOfStudy, expectedGraduation: String(p.gradYear), coursework: [], source: "user" }],
    experience: entries(picked("experience")),
    leadership: entries(picked("leadership")),
    projects: projects(picked("projects")),
    skills: { verified: f.skills ?? [], userStated: [] },
    memberships: [], activities: [], interests: [], markets: p.markets.map((m) => m.code), openQuestions: [],
  };
}

/** Last step: save everything and start the first search. */
export async function finishOnboarding() {
  const d = await getDraft();
  const persona = buildPersona(d);
  const profile = buildProfile(d, persona);
  await pool.query(`insert into profile (id, data, cv_text, cv_filename, updated_at) values (1, $1, $2, $3, now())
    on conflict (id) do update set data = excluded.data, cv_text = coalesce(excluded.cv_text, profile.cv_text), cv_filename = coalesce(excluded.cv_filename, profile.cv_filename), updated_at = now()`,
    [JSON.stringify(profile), d.cvText ?? null, d.cvFilename ?? null]);
  await savePersona(persona);
  const [first, ...rest] = (profile.name ?? "").split(" ");
  const cur = await getDetails();
  await saveDetails({ ...cur, firstName: first || cur.firstName, lastName: rest.join(" ") || cur.lastName, preferredName: first || cur.preferredName,
    email: profile.contact.email || cur.email, phone: profile.contact.phone || cur.phone, city: persona.home.city || cur.city,
    country: COUNTRIES[persona.home.country]?.name ?? cur.country, nationality: profile.nationality || cur.nationality,
    linkedin: profile.contact.linkedin ? `https://${profile.contact.linkedin}` : cur.linkedin, willingToRelocate: persona.relocate || cur.willingToRelocate,
    ...(persona.visa.expiry ? { visaExpiry: persona.visa.expiry } : {}), ...(d.details ?? {}) } as any);
  const mode = ["action", "important", "all", "quiet"].includes(d.notify?.mode ?? "") ? d.notify!.mode as any : "action";
  await setSetting("notifications", { mode });
  await setSetting("goals", { applicationsPerWeek: Math.max(1, Math.min(50, Number(d.notify?.goal) || 5)) });
  const added = await syncSearches(persona);
  return { persona, added };
}
