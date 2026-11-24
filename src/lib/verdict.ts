/**
 * Plain-English reasons to submit / not submit each application, built only from facts the app
 * already holds (match analysis, visa rules, requirement checks, location, dates). Nothing invented.
 */
import { halalCheck, HALAL_DEFAULTS, HALAL_OFF } from "@/lib/halal";
import { persona, market, rx, isUkStudent, article, COUNTRIES } from "@/lib/persona";
export type VerdictInput = {
  title: string; employer: string; location: string | null; country: string | null; category: string | null;
  match_score: number | null; match_reasons: string[] | null; eligibility: string | null; eligibility_reasons: string[] | null;
  missing_info?: string[] | null; salary?: string | null; deadline?: string | Date | null; description?: string | null;
};
export type Verdict = { call: string; tone: "good" | "ok" | "warn" | "bad"; pros: string[]; cons: string[] };

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isLondon = (loc: string) => /london|\b(se|sw|nw|ne|ec|wc|e|n|w)\d/i.test(loc);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inHomeCity = (loc: string) => {
  const h = persona().home;
  return h.cityMatch === "london" ? isLondon(loc) : !!h.city && rx(`\\b${esc(h.city)}\\b`, "i").test(loc);
};

export function verdict(j: VerdictInput, opts: { age?: number | null } = {}): Verdict {
  const pros: string[] = [], cons: string[] = [];
  const P = persona();
  const uni = P.universityShort || "your university";
  const G = P.gradYear, H = P.visa.termHours;
  const halal = halalCheck({ title: j.title, employer: j.employer, description: j.description }, P.filters.halal ? HALAL_DEFAULTS : HALAL_OFF);
  if (halal.blocked) cons.push(`☪️ ${halal.reason}`);
  for (const w of halal.warnings) cons.push(`☪️ ${w}`);
  const score = j.match_score ?? 0;
  const title = j.title.toLowerCase();
  const loc = j.location ?? "";
  const reasons = j.match_reasons ?? [];

  // --- Fit with your background
  const topics = reasons.filter((r) => /^(Mentions|Role focus):/.test(r)).map((r) => r.replace(/^(Mentions|Role focus):\s*/, ""));
  const skills = reasons.find((r) => r.startsWith("Uses your skills:"))?.replace("Uses your skills: ", "");
  if (score >= 70) pros.push(`Strong match (${score}%): ${topics.slice(0, 3).join(", ") || "close to your degree"}`);
  else if (score >= 50) pros.push(`Good match (${score}%)${topics.length ? `: ${topics.slice(0, 2).join(", ")}` : ""}`);
  else if (score < 35) cons.push(`Weak match (${score}%): few of your skills or subjects are mentioned`);
  else cons.push(`Average match (${score}%)`);
  if (skills) pros.push(`Uses skills on your CV: ${skills}`);
  if (P.offField && rx(P.offField.title).test(title) && !rx(P.offField.unless).test(title)) cons.push(P.offField.text);

  // --- Type of role
  switch (j.category) {
    case "summer_internship": pros.push(`Summer ${P.summerYear} internship: fits your summer break (${P.summerWindow})`); break;
    case "placement": pros.push("Placement year: a big boost to your CV and graduate job chances"); if (isUkStudent()) cons.push(`Must be part of your ${uni} course for your visa: ask ${uni} placements before accepting`); break;
    case "part_time": pros.push(isUkStudent() ? `Part-time: allowed on your Student visa (up to ${H} h/week in term)` : "Part-time: fits around your studies"); break;
    case "graduate": cons.push("Graduate role: usually for people finishing their degree, so you may be too early"); break;
    case "temporary": pros.push("Temporary work: easy to fit around university holidays"); break;
    case "other": cons.push(`Not ${article(P.fieldName)} role. Mainly useful for income or experience`); break;
  }
  if (/insight|spring week|open day/.test(title)) pros.push("Short insight programme: low effort, good way into their internships");

  // --- Visa / eligibility
  const elig = j.eligibility_reasons ?? [];
  if (j.eligibility === "eligible") pros.push(isUkStudent() && (j.country === "UK" || j.country === "REMOTE") ? "Fits your Student visa rules" : "No eligibility problems found");
  // Each visa/eligibility note from the checker, in plain words
  for (const r of elig) {
    if (/qatari nationals|qatarization/i.test(r)) cons.push("Qatari nationals may be preferred");
    else if (market(j.country)?.eligibilityReason === r && (market(j.country)?.verdictPro || market(j.country)?.verdictCon)) {
      const m = market(j.country)!;
      if (m.verdictPro) pros.push(m.verdictPro); else cons.push(m.verdictCon!);
    }
    else if (/graduation-year requirement/i.test(r)) cons.push(`Wants students graduating in ${G - 1}; you expect ${G}`);
    else if (/final-year students/i.test(r)) cons.push("May be for final-year students only");
    else if (/penultimate/i.test(r)) pros.push("Aimed at penultimate-year students: your stage next year");
    else if (/no sponsorship offered — you have restricted/i.test(r)) cons.push("No visa sponsorship: it must fit your Student visa work limits");
    else if (/whole internship must fall inside/i.test(r)) cons.push("All of it must fall inside your summer break (check their dates)");
    else if (/exceeds the \d+-hour/i.test(r)) cons.push(`Over ${H} hours a week: only allowed in university holidays`);
    else if (/full-time role: only workable/i.test(r)) cons.push("Full-time: only possible in university holidays");
  }
  if (j.eligibility === "manual_verification" && !["placement", "graduate"].includes(j.category ?? "") && !cons.length) cons.push("Eligibility needs a quick check before you submit");

  // --- Requirements you can't evidence yet
  const gaps = (j.missing_info ?? []).filter((m) => m.startsWith("Requirement without evidence:")).map((m) => m.replace("Requirement without evidence: ", ""));
  // "Studying a degree in X or a related field" is met by your Electrical & Electronic degree, so it is not a gap.
  const realGaps = gaps.filter((g) => !/not required|no (previous|prior)/i.test(g) && !/(currently )?(studying|enrolled|pursuing).{0,40}(degree|bachelor|master|undergraduate)|related (field|discipline|subject)|stem (degree|subject)/i.test(g));
  if (realGaps.length) cons.push(`Asks for something not on your CV: “${short(realGaps[0], 80)}”`);
  if (gaps.some((g) => /not required|no (previous|prior)/i.test(g)) || /no (previous |prior )?experience (is )?(required|needed)|experience (is )?not required/i.test(j.description ?? ""))
    pros.push("No previous industry experience needed");

  // --- Place
  const home = P.home;
  if (home.city && j.country === home.country) {
    const cname = COUNTRIES[home.country]?.name ?? home.country;
    const tail = home.country === "UK" ? /, (UK|United Kingdom)$/i : rx(`, ${esc(cname)}$`, "i");
    if (inHomeCity(loc)) pros.push(`In ${home.city}: no moving needed`);
    else if (loc && !rx(`remote|${esc(cname.toLowerCase())}$`, "i").test(loc.trim())) cons.push(`Based in ${loc.replace(tail, "")}: you'd need to stay there for the role`);
  } else if (market(j.country)?.placePro) pros.push(market(j.country)!.placePro!);
  else if (market(j.country)?.placeCon) cons.push(market(j.country)!.placeCon!);
  if (/remote/i.test(loc)) pros.push("Remote: no travel");

  // --- Minimum age (e.g. bar, driving, some security roles)
  const minAge = (j.description ?? "").match(/(?:must be|aged?|over the age of|at least|minimum age(?: of)?)\s*(21|23|25)\s*(?:\+|years|or over|and over)/i);
  if (minAge) {
    const need = Number(minAge[1]);
    if (opts.age != null) { if (opts.age < need) cons.push(`Must be ${need} or over; you're ${opts.age}`); }
    else cons.push(`Says you must be ${need} or over`);
  }

  // --- Other facts
  if (j.salary) pros.push(`Paid: ${j.salary}`);
  if (j.employer === "Unknown employer" || /recruit|agency|staffing/i.test(j.employer)) cons.push("Employer not named (agency advert): check it's genuine before sending your details");
  if (j.deadline) {
    const d = Math.ceil((new Date(j.deadline).getTime() - Date.now()) / 86400000);
    if (d < 0) cons.push("The deadline has passed");
    else if (d <= 7) cons.push(`Closes ${d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}: do it now or skip`);
  }

  // --- Overall call
  const blockers = halal.blocked || cons.some((c) => rx(`deadline has passed|final-year students only|too early|graduating in ${G - 1}|or over; you're`, "i").test(c));
  let call: string, tone: Verdict["tone"];
  if (blockers) { call = "⚠️ Probably skip"; tone = "bad"; }
  else if (halal.warnings.length) { call = "🤔 Your call"; tone = "warn"; } // a halal question comes first
  else if (score >= 60 && j.eligibility === "eligible") { call = "✅ Apply"; tone = "good"; }
  else if (j.category === "placement" || score >= 45) { call = "👍 Worth applying"; tone = "ok"; }
  else { call = "🤔 Your call"; tone = "warn"; }

  return { call, tone, pros: [...new Set(pros)].slice(0, 5), cons: [...new Set(cons)].slice(0, 5) };
}
