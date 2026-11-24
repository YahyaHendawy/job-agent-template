/**
 * Classification, eligibility and match scoring.
 *
 * UK Student visa rules applied (gov.uk Student route caseworker guidance v15.0, updated 16 Oct 2026):
 *  - degree-level: max 20 hours/week in term time; full-time allowed in official vacations
 *  - prohibited: self-employment/business activity, professional sportsperson or sports coach,
 *    entertainer, filling a permanent full-time vacancy
 *  - course-integral work placements allowed (≤ 50% of course length for degree level)
 * The exact limit printed on the owner's eVisa still needs confirming — so we never return
 * "eligible" for UK term-time work without noting that.
 * These rules apply only when the owner chose the UK Student visa preset in onboarding. Countries,
 * cities, fields and study dates all come from the owner's persona (src/lib/persona.ts).
 */
import type { Profile } from "@/profile";
import { persona, market, rx, isUkStudent, COUNTRIES } from "@/lib/persona";

export type Category =
  | "summer_internship" | "placement" | "part_time" | "temporary" | "research" | "graduate"
  | "insight_programme" | "other";
export type Eligibility = "eligible" | "potentially_eligible" | "ineligible" | "manual_verification";
export type Country = string; // a persona market code (e.g. "UK"), "REMOTE" or "OTHER"

export type JobInput = {
  title: string;
  employer: string;
  location?: string | null;
  description?: string | null;
  employmentType?: string | null;
  countryHint?: string | null;
};

const has = (text: string, re: RegExp) => re.test(text);

// Non-target countries: a location naming one of these is "OTHER" even if it also names a target city.
const FOREIGN_TERMS = ["us", "usa", String.raw`u\.s\.`, "united states", "canada", "india", "germany", "france", "spain", "italy", "poland", "netherlands", "ireland", "portugal", "romania", "china", "japan", "singapore", "australia", "brazil", "mexico", "uae", "dubai", "saudi", "new york", "new jersey", "new mexico", "new hampshire", "new south wales"];
const US_STATES = String.raw`,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|kc)\b`;
const REMOTE_RE = /\b(remote|work from home|anywhere)\b/i;
function foreignRe() {
  const targets = persona().markets.map((m) => COUNTRIES[m.code]).filter(Boolean).map((c) => new RegExp(c.names, "i"));
  const terms = FOREIGN_TERMS.filter((t) => !targets.some((r) => r.test(t.replace(/\\/g, ""))));
  const us = persona().markets.some((m) => m.code === "US");
  return rx(`\\b(${terms.join("|")})\\b${us ? "" : `|${US_STATES}`}`, "i");
}

const ISO: Record<string, string> = Object.fromEntries(Object.values(COUNTRIES).flatMap((c) => c.iso.map((i) => [i, c.name])));

const LONDON_AREAS = /\b(london|westminster|camden|islington|hackney|tower hamlets|southwark|lambeth|wandsworth|hammersmith|fulham|kensington|chelsea|brent|ealing|hounslow|richmond|kingston|merton|sutton|croydon|bromley|lewisham|greenwich|bexley|havering|barking|dagenham|redbridge|newham|waltham forest|haringey|enfield|barnet|harrow|hillingdon|stratford|canary wharf|shoreditch|soho|holborn|kilburn|clapham|brixton|peckham|wimbledon|surbiton|new malden|elephant and castle|waterloo|borough|bermondsey|battersea|putney|walthamstow|wembley|uxbridge|romford|ilford)\b/i;
// Inner/outer London postcode districts, e.g. SW1P, W2, EC1A, N7, plus Greater-London prefixes
const LONDON_POSTCODE = /\b(E|EC|N|NW|SE|SW|W|WC)\d{1,2}[A-Z]?\s?\d?[A-Z]{0,2}\b|\b(BR|CR|EN|HA|IG|KT|RM|SM|TW|UB)\d{1,2}\s?\d?[A-Z]{0,2}\b/;
export function isLondon(location: string | null | undefined) {
  const l = location ?? "";
  return LONDON_AREAS.test(l) || LONDON_POSTCODE.test(l.toUpperCase());
}

/** Is this location in the owner's home city? (London has its own borough/postcode rules.) */
export function isHomeCity(location: string | null | undefined) {
  const h = persona().home;
  if (h.cityMatch === "london") return isLondon(location);
  return !!h.city && rx(`\\b${h.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(location ?? "");
}

export function detectCountry(location: string | null | undefined, hint?: string | null): Country {
  const h = hint && ISO[hint.trim().toLowerCase()] ? ISO[hint.trim().toLowerCase()] : hint;
  const l = `${location ?? ""} ${h ?? ""}`;
  const ms = persona().markets.filter((m) => COUNTRIES[m.code]);
  for (const m of ms) if (rx(COUNTRIES[m.code].names, "i").test(l)) return m.code;
  if (foreignRe().test(l)) return "OTHER";
  for (const m of ms) { const c = COUNTRIES[m.code].cities; if (c && rx(c, "i").test(l)) return m.code; }
  if (REMOTE_RE.test(l) && !/\b(us|usa|united states|canada|germany|india|france|spain|poland|netherlands)\b/i.test(l)) return "REMOTE";
  return "OTHER";
}

export function classify(j: JobInput): Category {
  const t = `${j.title} ${j.employmentType ?? ""}`.toLowerCase();
  const d = (j.description ?? "").toLowerCase();
  if (/\b(insight|spring week|discovery (day|programme)|open day|work experience week)\b/.test(t)) return "insight_programme";
  if (/\b(placement|industrial placement|industrial trainee|year in industry|sandwich|12[- ]month intern|year[- ]long intern|industrial trainee)\b/.test(t)) return "placement";
  if (/\b(summer|intern|internship|vacation scheme|vacation student|summer training|co-?op)\b/.test(t)) return "summer_internship";
  if (/\b(research (assistant|intern)|urop|undergraduate research)\b/.test(t)) return "research";
  if (/\b(part[- ]time|weekend|student ambassador|student brand|campus)\b/.test(t)) return "part_time";
  if (/\b(temporary|temp|seasonal|christmas|fixed[- ]term|casual)\b/.test(t)) return "temporary";
  if (/\b(graduate|grad scheme|new grad|early careers?)\b/.test(t)) return "graduate";
  if (/\bpart[- ]time\b/.test(d)) return "part_time";
  return "other";
}

const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|head of|director|manager|vp|chief|architect|experienced|mid[- ]level)\b/i;
const STUDENT_RE = /\b(intern|internship|placement|industrial placement|industrial trainee|year in industry|sandwich|student|undergraduate|summer|vacation|graduate|fresh grad(uate)?s?|early careers?|insight|spring week|ambassador|part[- ]time|trainee|traineeship|co-?op|summer training|training program(me)?)\b/i;
const NOT_FOR_HIM_RE = /\b(apprentice|apprenticeship|phd|doctoral|postdoc|post-doctoral|mba|masters? (student|intern)|msc intern)\b/i;
// Jobs that need a professional qualification/licence he doesn't have (teaching assistants & tutors are fine)
const QUALIFIED_RE = /\b(teacher|lecturer|nurse|midwife|doctor|gp|pharmacist|dentist|physiotherapist|solicitor|lawyer|barrister|accountant|surveyor|architect|social worker|hgv|driver|chef|sous chef|carpenter|plumber|electrician|gas engineer|mechanic|optometrist|paralegal|psychologist)\b/i;
const QUALIFIED_OK = /\b(teaching assistant|learning support|tutor|student|trainee|intern|apprentice)\b/i;
// Gig platforms = self-employment, which a Student visa doesn't allow
export const GIG_RE = /\b(housekeep|uber|deliveroo rider|just eat courier|stuart courier|bolt driver|amazon flex|taskrabbit|fiverr|upwork|helpling|bark\.com|self[- ]employed)\b/i;

/** Should this listing be stored at all? (Student-level roles in target markets only.) */
export function isRelevant(j: JobInput, category: Category, country: Country, opts: { aggregatorQuery?: boolean } = {}) {
  const P = persona();
  if (!(P.markets.some((m) => m.code === country) || (country === "REMOTE" && P.remoteOk))) return false;
  if (NOT_FOR_HIM_RE.test(j.title)) return false;
  if (QUALIFIED_RE.test(j.title) && !QUALIFIED_OK.test(j.title)) return false;
  if (GIG_RE.test(`${j.employer} ${j.title}`)) return false;
  if (SENIOR_RE.test(j.title) && !/\b(intern|placement|student)\b/i.test(j.title)) return false;
  if (STUDENT_RE.test(j.title)) return true;
  // Aggregator searches are already targeted at part-time / student work.
  if (opts.aggregatorQuery && (category === "part_time" || category === "temporary")) return true;
  return false;
}

export type EligibilityResult = { status: Eligibility; reasons: string[]; missing: string[] };

export function assessEligibility(j: JobInput, category: Category, country: Country, p: Profile | null): EligibilityResult {
  const text = `${j.title}\n${j.employmentType ?? ""}\n${j.description ?? ""}`.toLowerCase();
  const reasons: string[] = [];
  const missing: string[] = [];
  let status: Eligibility = "eligible";
  const P = persona();
  const uni = P.universityShort || "your university";
  const visaEnd = P.visa.expiry ? `your Student visa reportedly ends ${P.visa.expiry}` : "check when your Student visa ends";
  const H = P.visa.termHours;
  const ukCitizen = market("UK")?.rightToWork === "citizen" || market("UK")?.rightToWork === "full";
  const downgrade = (to: Eligibility) => {
    const order: Eligibility[] = ["eligible", "potentially_eligible", "manual_verification", "ineligible"];
    if (order.indexOf(to) > order.indexOf(status)) status = to;
  };

  // Hard nationality / clearance blockers
  if (!ukCitizen && has(text, /\b(sc|dv|security) clearance\b|\bdeveloped vetting\b|\beligible (for|to obtain) (sc|security)/)) {
    reasons.push("Requires UK security clearance (SC/DV). Clearance usually needs several years of UK residence; a Student visa holder is unlikely to qualify.");
    downgrade("ineligible");
  }
  if (!ukCitizen && has(text, /\b(sole )?british (citizen|national)s? only\b|\bmust be a british (citizen|national)\b|\buk nationals? only\b/)) {
    reasons.push("Restricted to British nationals.");
    downgrade("ineligible");
  }
  if (has(text, /\bqatari nationals?( only)?\b|\bqatari citizens?\b|\bqatarization\b|\bqatarisation\b/)) {
    if (/\bqatari nationals?\b|\bqataris? only\b/i.test(j.title) || has(text, /\bqatari nationals? only\b|\bopen to qatari nationals\b|\bqatari citizens? only\b|\bfor qatari nationals\b/)) {
      reasons.push("Restricted to Qatari nationals.");
      downgrade("ineligible");
    } else {
      reasons.push("Mentions Qatari nationals / Qatarization — non-Qatari residents may be deprioritised or excluded.");
      downgrade("manual_verification");
    }
  }
  if (has(text, /\b(egyptian nationals?|egyptians only)\b/) && country !== "EG") downgrade("manual_verification");

  // Prohibited work types for Student visa holders (UK)
  if (isUkStudent() && (country === "UK" || country === "REMOTE")) {
    if (GIG_RE.test(`${j.employer} ${j.title}`) || has(text, /\b(self[- ]employed|freelance|commission[- ]only|independent contractor|umbrella company|limited company contractor|b2b contract)\b/)) {
      reasons.push("Self-employment / contractor work is prohibited on a Student visa.");
      downgrade("ineligible");
    }
    if (has(text, /\b(sports coach|professional (athlete|sportsperson)|entertainer|performer)\b/)) {
      reasons.push("Sports coaching / professional sport / entertainer work is prohibited on a Student visa.");
      downgrade("ineligible");
    }
    if (category === "graduate") {
      reasons.push(`Graduate role: would start after your course ends; ${visaEnd}, so this would need Graduate route or sponsorship.`);
      downgrade("manual_verification");
      missing.push("Start date vs. visa expiry; whether employer sponsors Skilled Worker visas.");
    }
    if (has(text, /\bpermanent\b/) && has(text, /\bfull[- ]time\b/) && !["summer_internship", "placement"].includes(category)) {
      reasons.push("Permanent full-time vacancy — Student visa holders cannot fill a permanent full-time vacancy.");
      downgrade("ineligible");
    }
    if (has(text, /\b(without (the )?need (for|of) (visa )?sponsorship|without requiring (visa )?sponsorship|no (visa )?sponsorship|unable to (offer|provide)? ?(visa )?sponsor(ship)?|(cannot|can't|do not|don't|will not) (offer |provide )?(visa )?sponsor(ship)?|must (already )?have (the )?(full |unrestricted )?right to work)/)) {
      if (has(text, /right to work[^.]{0,40}full duration/)) {
        reasons.push(`Requires right to work for the full duration: the whole internship must fall inside ${uni}'s official vacation (or within ${H} h/week in term time).`);
        missing.push(`${uni} summer ${P.summerYear} vacation dates vs. the internship dates.`);
      }
      if (has(text, /\bunrestricted\b|\bfull right to work\b|\bindefinite\b/)) {
        reasons.push("Requires unrestricted/full UK right to work — a Student visa gives restricted permission.");
        downgrade("manual_verification");
      } else if (category === "summer_internship" || category === "placement") {
        reasons.push("No sponsorship offered — normally fine: Student visa permits full-time vacation work and course-integral placements.");
      } else {
        reasons.push("No sponsorship offered — you have restricted permission to work on your Student visa.");
      }
    }
    if (category === "part_time" || category === "other") {
      const hours = text.match(/\b(\d{2})(?:\s*[-–]\s*(\d{2}))?\s*(?:hours|hrs)\b(?:\s*(?:per|a|\/)\s*week)?/);
      const h = hours ? Number(hours[2] ?? hours[1]) : null;
      if (h && h > H) {
        reasons.push(`Advertised ${h} hours/week exceeds the ${H}-hour term-time limit (allowed only in official vacations).`);
        downgrade("potentially_eligible");
      } else if (h) {
        reasons.push(`${h} hours/week is within the ${H}-hour term-time limit.`);
      } else {
        missing.push(`Weekly hours not stated — must stay ≤ ${H} hours in term time.`);
        downgrade("potentially_eligible");
      }
      if (has(text, /\bfull[- ]time\b/) && !has(text, /\bpart[- ]time\b/)) {
        reasons.push("Full-time role: only workable during official university vacations.");
        downgrade("potentially_eligible");
      }
    }
    if (category === "placement") {
      reasons.push(`Placement year must be approved by ${uni} as part of your course and may require a new CAS / visa extension (${P.visa.expiry ? `visa reportedly ends ${P.visa.expiry}` : "check your visa end date"}).`);
      missing.push(`${uni} confirmation that a placement year is available on your course.`);
      downgrade("manual_verification");
    }
    if (category === "summer_internship") {
      reasons.push(`Summer internship falls in the university vacation, when full-time work is permitted on a Student visa (confirm vacation dates with ${uni}).`);
    }
  }

  const m = market(country);
  if (m?.eligibilityReason) reasons.push(m.eligibilityReason);
  if (m?.eligibilityLevel) downgrade(m.eligibilityLevel);

  // Academic stage
  const G = P.gradYear;
  if (has(text, rx(`\\b(final[- ]year (students?|undergraduates?)|in (your|their) final year|graduating (in|this) (${G - 2}|${G - 1})|must have graduated|recent(ly)? graduated?|class of ${G - 2}|class of ${G - 1})\\b`)) && !has(text, /penultimate/)) {
    reasons.push(`Targets final-year students / graduates; you expect to graduate in ${G}.`);
    downgrade(category === "graduate" ? "manual_verification" : "potentially_eligible");
  }
  if (has(text, /\bpenultimate\b/)) reasons.push(`Targets penultimate-year students — matches your stage in ${G - 2}/${String(G - 1).slice(2)}.`);
  const gradYears = [...text.matchAll(/\bgraduat(?:e|ing|ion)[^.]{0,40}?\b(20\d\d)\b/g)].map((m) => Number(m[1]));
  if (gradYears.length && !gradYears.some((y) => y === G || y === (P.gradYearPlacement ?? G))) {
    reasons.push(`Graduation-year requirement (${[...new Set(gradYears)].join(", ")}) may not match your expected ${G}.`);
    downgrade("potentially_eligible");
    missing.push(`Confirm exact expected graduation year with ${uni}.`);
  }
  const yrs = text.match(/\b(\d+)\+?\s*years?'?\s*(of\s+)?(relevant |professional |industry )?experience\b/);
  if (yrs && Number(yrs[1]) >= 2) {
    reasons.push(`Asks for ${yrs[1]}+ years of experience.`);
    downgrade("ineligible");
  }
  if (has(text, /\b(phd|master'?s degree required|msc required)\b/)) {
    reasons.push("Requires a postgraduate degree.");
    downgrade("ineligible");
  }
  if (has(text, /\b(driving licen[cs]e|full uk driving)\b/)) missing.push("Driving licence requirement — do you hold one?");

  if (isUkStudent() && status === "eligible" && (country === "UK" || country === "REMOTE"))
    missing.push(`Confirm the work conditions on your eVisa (${H} hours/week term-time limit assumed).`);
  return { status, reasons, missing };
}

export function score(j: JobInput, category: Category, country: Country, elig: Eligibility, opts: { londonPartTime?: boolean } = {}) {
  const text = `${j.title} ${j.description ?? ""}`.toLowerCase();
  const reasons: string[] = [];
  let s = 20;
  const catBonus: Record<Category, number> = {
    summer_internship: 25, placement: 22, research: 20, part_time: 12, temporary: 10, insight_programme: 8, graduate: 4, other: 5,
  };
  s += catBonus[category];
  reasons.push(`Category: ${category.replace(/_/g, " ")}`);

  // Title matches count fully; description-only matches count a third (long descriptions mention everything).
  const title = j.title.toLowerCase();
  let interest = 0;
  const P = persona();
  for (const { pattern, weight: w, label } of P.interests) {
    const re = rx(pattern);
    if (re.test(title)) { interest += w; reasons.push(`Role focus: ${label}`); }
    else if (re.test(text)) { interest += w / 3; reasons.push(`Mentions: ${label}`); }
  }
  s += Math.min(35, interest);
  const technical = rx(P.technicalTitle, "i").test(j.title);
  if (!technical && ["summer_internship", "placement", "research", "graduate"].includes(category)) {
    s -= 18;
    reasons.push(`Non-${P.fieldName} role`);
  }

  const skills = P.skills.filter((k) => rx(k.pattern).test(text)).map((k) => k.label);
  if (skills.length) { s += Math.min(10, skills.length * 3); reasons.push(`Uses your skills: ${skills.join(", ")}`); }

  if (rx(P.fieldText).test(text) && /\b(student|intern|placement|undergraduate)\b/.test(text)) s += 5;
  // Market focus: the home country centred on the home city; other target countries anywhere.
  const home = P.home;
  const inHome = isHomeCity(j.location);
  const termTimeWork = category === "part_time" || category === "temporary";
  if (home.city && country === home.country && inHome) { s += termTimeWork ? 14 : 8; reasons.push(`Located in ${home.city} (priority)`); }
  else if (home.city && country === home.country && termTimeWork) { s -= 15; reasons.push(`Part-time/temporary outside ${home.city} — hard to combine with study at ${P.universityShort || "university"}`); }
  const m = market(country);
  if (m && country !== home.country) {
    s += m.priority ?? 8;
    reasons.push(`${COUNTRIES[country]?.name ?? country} (priority market)`);
    if ((m.inPersonPartTimeAbroad ?? true) && termTimeWork && !/\b(remote|summer|vacation|seasonal)\b/i.test(text)) { s -= 12; reasons.push("In-person part-time abroad — only workable during vacations"); }
  }
  if (opts.londonPartTime && category === "part_time") s += 5;

  const penalty: Record<Eligibility, number> = { eligible: 0, potentially_eligible: 8, manual_verification: 12, ineligible: 45 };
  // Every placement needs the same university/visa check, so it shouldn't push placements below internships.
  s -= category === "placement" && elig === "manual_verification" ? 3 : penalty[elig];
  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons };
}

export function evaluate(j: JobInput, p: Profile | null, opts: { aggregatorQuery?: boolean } = {}) {
  let country = detectCountry(j.location, j.countryHint);
  if (country === "OTHER") { const fromTitle = detectCountry(j.title); if (fromTitle !== "OTHER") country = fromTitle; } // e.g. location "In-Office", title "… - London, UK"
  const category = classify(j);
  const relevant = isRelevant(j, category, country, opts);
  const elig = assessEligibility(j, category, country, p);
  const sc = score(j, category, country, elig.status);
  return { country, category, relevant, eligibility: elig, score: sc.score, scoreReasons: sc.reasons };
}
