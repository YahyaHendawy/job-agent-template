/**
 * A rough estimate of getting an offer, with reasons it could go your way and reasons it might not.
 * Built only from facts the app holds (type of role, match, visa fit, requirements shown on your CV,
 * timing, answers written, stage). Employers don't publish acceptance rates, so this is a guide, not a prediction.
 */
import { persona, isUkStudent } from "@/lib/persona";

export type ChanceInput = {
  title: string; employer: string; category: string | null; match_score: number | null; eligibility: string | null;
  missing_info?: string[] | null; description?: string | null; deadline?: string | Date | null; discovered_at?: string | Date | null;
  source_kind?: string | null; answers?: { evidence?: string; requirement?: string }[] | null; status?: string | null;
  written?: { answer?: string }[] | null; unanswered?: number | null;
};
export type Chance = { pct: number; label: string; tone: "good" | "ok" | "warn" | "bad"; could: string[]; couldnt: string[]; basis: string; stage?: string };

const AGG = ["reed", "jooble", "adzuna", "careerjet"];
const days = (d?: string | Date | null) => (d ? (new Date(d).getTime() - Date.now()) / 86400000 : null);

export function chance(j: ChanceInput): Chance {
  const could: string[] = [], couldnt: string[] = [];
  const P = persona();
  const title = j.title.toLowerCase();
  const desc = j.description ?? "";
  const score = j.match_score ?? 0;

  // Where it starts: how competitive this kind of role usually is
  let pct: number;
  let basis: string;
  const insight = /insight|spring week|open day|taster/.test(title);
  if (insight) { pct = 22; basis = "Insight and spring programmes take many students and are easier to get"; }
  else switch (j.category) {
    case "summer_internship": pct = 7; basis = "Summer internships are very competitive: big employers often get dozens of applicants per place"; break;
    case "placement": pct = 9; basis = "Placement years are competitive, but fewer students apply than for summer internships"; break;
    case "graduate": pct = 3; basis = "Graduate schemes are the most competitive, and usually want final-year students"; break;
    case "part_time": pct = 28; basis = "Part-time and student jobs hire more people and decide quickly"; break;
    case "temporary": pct = 30; basis = "Temporary and seasonal roles hire in volume"; break;
    default: pct = 18; basis = "Typical odds for this kind of role";
  }

  // Who's hiring: large-employer careers sites vs smaller firms and agencies
  if (j.source_kind && !AGG.includes(j.source_kind)) { pct *= 0.8; couldnt.push(`${j.employer} is a well-known employer, so many students apply`); }
  else if (j.source_kind && AGG.includes(j.source_kind) && j.employer !== "Unknown employer") { pct *= 1.2; could.push("Smaller or less-advertised employers get fewer applicants"); }

  // Fit with your CV
  pct *= 0.5 + score / 100;
  if (score >= 70) could.push(`Strong match with your degree and skills (${score}%)`);
  else if (score >= 50) could.push(`Decent match with your background (${score}%)`);
  else couldnt.push(`Weak match (${score}%): other applicants will fit what they ask for better`);

  const reqs = j.answers ?? [];
  const shown = reqs.filter((r) => r.evidence === "verified").length;
  const gaps = (j.missing_info ?? []).filter((m) => m.startsWith("Requirement without evidence:"))
    .filter((g) => !/not required|no (previous|prior)|related (field|discipline|subject)|(studying|enrolled|pursuing).{0,40}(degree|bachelor)/i.test(g));
  if (shown) { pct *= 1 + Math.min(shown, 4) * 0.05; could.push(`Your CV shows ${shown} thing${shown > 1 ? "s" : ""} they ask for`); }
  if (gaps.length) { pct *= Math.pow(0.85, Math.min(gaps.length, 3)); couldnt.push(`${gaps.length} requirement${gaps.length > 1 ? "s" : ""} not shown on your CV yet`); }
  if (/no (previous |prior )?experience (is )?(required|needed)|experience (is )?not required|no experience necessary/i.test(desc)) { pct *= 1.15; could.push("No experience needed, so you're on a level with other students"); }
  else if (["summer_internship", "placement"].includes(j.category ?? "")) couldnt.push("You'll be up against students with previous internships or projects");

  // Visa and eligibility
  if (j.eligibility === "eligible") { pct *= 1.1; could.push(isUkStudent() ? "Fits your Student visa rules" : "No eligibility problems found"); }
  else if (j.eligibility === "potentially_eligible") { pct *= 0.8; couldnt.push("Eligibility isn't certain: some employers screen out anyone who might need a visa"); }
  else if (j.eligibility === "manual_verification") { pct *= 0.75; couldnt.push("Eligibility needs checking; if it doesn't fit, they can't accept you"); }
  if (isUkStudent() && /(unable|not able|cannot|can't) (to )?sponsor|without (requiring )?(visa )?sponsorship|right to work .{0,40}(full|entire|whole) (duration|length)/i.test(desc)) {
    pct *= 0.8; couldnt.push("They say no visa sponsorship: your Student visa must cover the whole role (usually fine for a course placement, check with your university)");
  }
  if (/penultimate/i.test(desc)) {
    const G = P.gradYear, now = new Date();
    const penultimateNow = G - (now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()) === 1;
    if (!penultimateNow) { pct *= 0.5; couldnt.push("Aimed at penultimate-year students; you're at a different stage"); }
    else could.push("Aimed at penultimate-year students: that's you");
  }
  if (/final[- ]year students only|graduat(ing|e) in 20\d\d only/i.test(desc)) { pct *= 0.4; couldnt.push("Seems to be for final-year students or a specific graduation year"); }

  // Timing
  const posted = days(j.discovered_at), dl = days(j.deadline);
  if (posted != null && posted > -7) { pct *= 1.15; could.push("Found within the last week: many employers review as applications arrive, so early helps"); }
  else if (posted != null && posted < -35) { pct *= 0.85; couldnt.push("Advertised over a month ago: it may already have many applicants or be close to filled"); }
  if (dl != null && dl < 0) { pct = 0; couldnt.unshift("The deadline has passed"); }
  else if (dl != null && dl <= 3) couldnt.push("Closes in a few days: a rushed application is weaker");

  // Your effort
  if (j.unanswered === 0 && (j.written?.length ?? 0) > 0) { pct *= 1.1; could.push("Your answers are written in your own words"); }
  else if ((j.unanswered ?? 0) > 0) couldnt.push(`${j.unanswered} answer${j.unanswered! > 1 ? "s" : ""} still to write: strong, specific answers are where most applications win or lose`);
  if (j.employer === "Unknown employer" || /recruit|agency|staffing/i.test(j.employer)) couldnt.push("Agency advert: the agency may send other candidates first");

  // Where the application is now changes everything
  let stage: string | undefined;
  switch (j.status) {
    case "assessment": pct = Math.max(pct, 20); stage = "You passed the first screen: now it's about the test"; break;
    case "interview": pct = Math.max(pct, 35); stage = "Interview stage: usually a handful of people per place"; break;
    case "offer": pct = 100; stage = "You have an offer 🎉"; break;
    case "rejected": pct = 0; stage = "They said no this time"; break;
    case "withdrawn": pct = 0; stage = "Withdrawn"; break;
  }

  pct = Math.max(0, Math.min(j.status === "offer" ? 100 : 85, pct));
  pct = pct < 10 ? Math.max(pct > 0 ? 1 : 0, Math.round(pct)) : Math.round(pct / 5) * 5;
  const [label, tone]: [string, Chance["tone"]] =
    j.status === "offer" ? ["Offer", "good"] : pct === 0 ? ["Closed", "bad"] : pct < 8 ? ["Long shot", "bad"] : pct < 18 ? ["Possible", "warn"] : pct < 35 ? ["Good chance", "ok"] : ["Strong chance", "good"];
  return { pct, label, tone, could: [...new Set(could)].slice(0, 5), couldnt: [...new Set(couldnt)].slice(0, 5), basis, stage };
}

export const chanceColor = (t: Chance["tone"]) => (t === "good" ? "var(--good)" : t === "ok" ? "var(--accent)" : t === "warn" ? "var(--warn)" : "var(--bad)");
