/**
 * Standard application answers. Everything comes from the verified profile, the onboarding answers
 * (persona) or the details the owner entered in Settings → Application details. Free-text "personal"
 * questions are NEVER auto-written: the agent gives a factual outline and the owner writes them in
 * their own words.
 */
import type { Profile } from "@/profile";
import { persona, market, isUkStudent, countryName } from "@/lib/persona";

export type ApplicationDetails = {
  preferredName?: string; firstName?: string; lastName?: string;
  email?: string; phone?: string;
  addressLine1?: string; addressLine2?: string; city?: string; postcode?: string; country?: string;
  dateOfBirth?: string; nationality?: string;
  linkedin?: string; github?: string; portfolio?: string;
  visaExpiry?: string;
  earliestStartSummer?: string; latestEndSummer?: string; termTimeHours?: string;
  drivingLicence?: "yes" | "no" | "";
  futureSponsorship?: "yes" | "ask" | "";
  unspentConvictions?: "yes" | "no" | "";
  willingToRelocate?: string;
  currentAverage?: string;
  howHeard?: string;
};

export type Answer = { group: string; question: string; answer: string; needsYou?: string; sensitive?: boolean };

export function defaultDetails(p: Profile | null): ApplicationDetails {
  const [first, ...rest] = (p?.name ?? "").split(" ");
  return {
    preferredName: first, firstName: first, lastName: rest.join(" "),
    email: p?.contact?.email, phone: p?.contact?.phone,
    city: persona().home.city || undefined, country: countryName(persona().home.country) || undefined,
    nationality: p?.nationality, linkedin: p?.contact?.linkedin ? `https://${p.contact.linkedin.replace(/^https?:\/\//, "")}` : undefined,
    willingToRelocate: persona().relocate || undefined,
    howHeard: "Company careers website",
    termTimeHours: isUkStudent() ? `Up to ${persona().visa.termHours} hours per week during term time; full-time in university vacations` : undefined,
  };
}

type JobLite = { title: string; employer: string; category: string | null; country: string | null; description?: string | null };

export function standardAnswers(job: JobLite, p: Profile, d: ApplicationDetails): Answer[] {
  const edu = p.education?.[0] ?? {};
  const school = p.education?.[1];
  const missing = (v?: string) => (v && v.trim() ? v : "");
  const a: Answer[] = [];
  const add = (group: string, question: string, answer: string | undefined, extra: Partial<Answer> = {}) =>
    a.push({ group, question, answer: missing(answer), ...(answer ? {} : { needsYou: extra.needsYou ?? "Add this in Settings → Application details" }), ...extra });

  add("Personal", "First name", d.firstName);
  add("Personal", "Last name", d.lastName);
  add("Personal", "Preferred name", d.preferredName);
  add("Personal", "Email", d.email);
  add("Personal", "Phone", d.phone);
  add("Personal", "Address", [d.addressLine1, d.addressLine2].filter(Boolean).join(", "), { sensitive: true, ...((d as any).addressChoice === "area-only" ? { needsYou: "You chose to type your street address yourself when a form needs it" } : {}) });
  add("Personal", "City", d.city);
  add("Personal", "Postcode", d.postcode, { sensitive: true });
  add("Personal", "Country", d.country);
  add("Personal", "LinkedIn", d.linkedin);
  if (d.github) add("Personal", "GitHub", d.github);
  if (d.portfolio) add("Personal", "Website / portfolio", d.portfolio);

  add("Education", "University", edu.institution);
  add("Education", "Degree", edu.degree);
  const P = persona();
  const uni = P.universityShort || "your university";
  add("Education", "Year of study", P.yearOfStudy);
  const placementRole = job.category === "placement";
  add("Education", "Expected graduation", placementRole && P.gradYearPlacement ? `${P.gradYearPlacement} (with a placement year)` : String(P.gradYear));
  add("Education", "Current average / predicted grade", d.currentAverage, { needsYou: d.currentAverage ? undefined : "Optional: add if you know your current average" });
  if (school) add("Education", "A-levels / previous education", school.qualifications?.join("; "));

  // Right to work — inferred from UK Student visa (gov.uk Student route guidance v15.0)
  const m = market(job.country);
  if (isUkStudent() && (job.country === "UK" || job.country === "REMOTE")) {
    const vacationWork = ["summer_internship", "part_time", "temporary", "research", "insight_programme"].includes(job.category ?? "");
    add("Right to work", "Do you have the right to work in the UK?", `Yes, I hold a UK Student visa (work permitted: up to ${P.visa.termHours} hours/week in term time, full-time during official university vacations).`);
    if (vacationWork) {
      add("Right to work", "Will you require visa sponsorship for this role?", "No. My UK Student visa permits this work, so no sponsorship is needed for this role.");
      add("Right to work", "…“now or in the future” version of that question", `Not for this role. I may require sponsorship for a permanent position after I graduate in ${P.gradYear}.`,
        { needsYou: "Use this wording only if the form asks about the future too" });
    } else if (placementRole) {
      add("Right to work", "Will you require visa sponsorship?", "No for a course-integral placement approved by my university (may need a visa extension).", { needsYou: `Placement: confirm with ${uni} (CAS/visa extension) before answering` });
    } else {
      add("Right to work", "Will you require visa sponsorship?", "Yes, after my Student visa ends I would require sponsorship.", { needsYou: "Graduate/permanent role: check this answer before submitting" });
    }
    add("Right to work", "Visa type / expiry", d.visaExpiry ? `UK Student visa, valid until ${d.visaExpiry}` : "", { sensitive: true, needsYou: d.visaExpiry ? undefined : "Add your visa expiry date (from your eVisa) in Application details" });
  } else if (m && (m.answer || m.answerNeedsYou)) {
    add("Right to work", `Right to work in ${countryName(m.code)}`, m.answer ?? "", m.answerNeedsYou ? { needsYou: m.answerNeedsYou } : {});
  } else if (m && (m.rightToWork === "citizen" || m.rightToWork === "full")) {
    add("Right to work", `Do you have the right to work in ${countryName(m.code)}?`, "Yes");
    add("Right to work", "Will you require visa sponsorship?", "No");
  } else if (m) {
    add("Right to work", `Right to work in ${countryName(m.code)}`, "", { needsYou: `Check your right to work in ${countryName(m.code)} before answering` });
  }
  add("Right to work", "Nationality", d.nationality);

  add("Availability", "Earliest start date", d.earliestStartSummer, { needsYou: d.earliestStartSummer ? undefined : `Add the date your summer vacation starts (${uni} term dates)` });
  if (d.latestEndSummer) add("Availability", "Latest end date", d.latestEndSummer);
  if (job.category === "part_time" || job.category === "temporary") add("Availability", "Hours available", d.termTimeHours);
  add("Availability", "Willing to relocate?", d.willingToRelocate);

  add("Other", "Driving licence", d.drivingLicence === "yes" ? "Yes" : d.drivingLicence === "no" ? "No" : "", { needsYou: d.drivingLicence ? undefined : "Answer once in Application details" });
  add("Other", "Do you have any unspent criminal convictions?", d.unspentConvictions === "no" ? "No" : d.unspentConvictions === "yes" ? "Yes (answer yourself on the form)" : "",
    { sensitive: true, needsYou: d.unspentConvictions ? (d.unspentConvictions === "yes" ? "Answer this one yourself on the form" : undefined) : "Answer once in Application details" });
  add("Other", "How did you hear about us?", d.howHeard);
  for (const q of ["Gender", "Ethnicity", "Religion or belief", "Disability", "Sexual orientation", "Age group"])
    add("Equal opportunities (optional)", q, "Prefer not to say");
  return a;
}

/** Questions the owner must write themselves, with a factual outline from their CV to make it quick. */
export function writingPrompts(job: JobLite, p: Profile) {
  const text = `${job.title} ${job.description ?? ""}`.toLowerCase();
  const words = new Set(text.match(/[a-z+#]{4,}/g) ?? []);
  const score = (s: string) => (s.toLowerCase().match(/[a-z+#]{4,}/g) ?? []).filter((w) => words.has(w)).length;
  const facts = [
    ...p.projects.filter((x) => x.source === "cv").map((x) => `${x.name}: ${x.summary}`),
    ...p.experience.flatMap((e: any) => e.bullets.map((b: string) => `${e.role}, ${e.organisation}: ${b}`)),
    ...p.leadership.flatMap((e: any) => e.bullets.map((b: string) => `${e.role}: ${b}`)),
  ].sort((x, y) => score(y) - score(x)).slice(0, 5);
  const asks = /\b(cover letter|motivation|why (do )?you want|why (are you )?interested|tell us about|describe a time|personal statement)\b/i.test(job.description ?? "");
  return {
    likelyAsked: asks,
    prompts: [
      { question: `Why do you want to work at ${job.employer} / in this role?`, guide: "2–4 sentences in your own words: what about the work excites you, plus one link to your interests (embedded systems, energy, robotics…)." },
      { question: "Tell us about relevant experience or a project", guide: "Pick ONE fact below; say what you did, how, and what you learned." },
    ],
    facts,
  };
}
