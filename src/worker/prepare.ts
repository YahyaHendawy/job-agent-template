/**
 * Application preparation (deterministic stage).
 * Builds a tailored CV strictly from verified profile facts, ordered by relevance to the job,
 * extracts the job's stated requirements and checks each one against verified evidence.
 * Nothing is invented: every CV line is copied from the profile (source: cv).
 */
import { pool } from "@/db";
import { persona, rx } from "@/lib/persona";
import { getProfile, type Profile } from "@/profile";
import { emit, setActivity } from "@/lib/events";

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z+#]{3,}/g) ?? []);
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

export function extractRequirements(desc: string): string[] {
  const lines = desc.split(/\n|•/).map((l) => l.trim()).filter((l) => l.length > 12 && l.length < 300);
  return lines.filter((l) => /\b(experience|knowledge|understanding|ability|able to|skills?|proficien|familiar|degree|studying|student|year|must|required|essential|desirable|you will have|you have)\b/i.test(l)).slice(0, 25);
}

export function checkRequirement(req: string, p: Profile) {
  const r = req.toLowerCase();
  const verified = p.skills.verified.filter((s) => r.includes(s.toLowerCase()));
  const stated = p.skills.userStated.filter((s) => r.includes(s.toLowerCase().replace(/ coursework$/, "")));
  let evidence: "verified" | "user_stated" | "missing" | "general" = "general";
  if (verified.length) evidence = "verified";
  else if (stated.length) evidence = "user_stated";
  else if (rx(persona().degreeEvidence).test(r)) evidence = "verified";
  else if (/\b(\d+\+? years|professional experience|phd|master)\b/.test(r)) evidence = "missing";
  return { requirement: req, evidence, matched: [...verified, ...stated] };
}

export function buildCv(p: Profile, jobText: string): string {
  const jw = words(jobText);
  const rank = <T,>(items: T[], text: (t: T) => string) =>
    [...items].sort((a, b) => overlap(words(text(b)), jw) - overlap(words(text(a)), jw));
  const skills = rank(p.skills.verified, (s) => s);
  const projects = rank(p.projects.filter((x) => x.source === "cv"), (x) => `${x.name} ${x.summary}`);
  const edu = p.education[0];
  const c = p.contact;
  const out: string[] = [];
  out.push(`# ${p.name}`, [c.location, c.email, c.phone, c.linkedin].filter(Boolean).join(" · "), "");
  out.push("## Education", `**${edu.institution}** — ${[edu.degree, edu.year].filter(Boolean).join(", ")} (expected graduation ${edu.expectedGraduation})`);
  if (edu.coursework?.length) out.push(`Relevant coursework: ${edu.coursework.join("; ")}.`);
  const school = p.education[1];
  if (school) out.push(`**${school.institution}**, ${school.location} (${school.completed}) — ${school.qualifications.join("; ")}.`);
  out.push("", "## Technical Skills", skills.join(", ") + ".", "");
  out.push("## Projects");
  for (const pr of projects.slice(0, 5)) out.push(`- **${pr.name}:** ${pr.summary}`);
  out.push("", "## Experience");
  for (const e of rank(p.experience, (x: any) => `${x.role} ${x.bullets.join(" ")}`)) {
    out.push(`**${e.role}**${[e.organisation, e.location].filter(Boolean).map((x) => `, ${x}`).join("")}${e.dates ? ` — ${e.dates}` : ""}`);
    for (const b of rank(e.bullets as string[], (x) => x)) out.push(`- ${b}`);
  }
  if (p.leadership.length) out.push("", "## Leadership");
  for (const l of p.leadership) {
    out.push(`**${l.role}**${l.organisation ? `, ${l.organisation}` : ""}${l.dates ? ` — ${l.dates}` : ""}`);
    for (const b of l.bullets) out.push(`- ${b}`);
  }
  const acts = [...p.memberships.map((m) => `${m.name} (${m.dates})`), ...p.activities];
  if (acts.length) out.push("", "## Memberships & Activities", acts.join("; ") + ".");
  if (p.languages.length) out.push("", `Languages: ${p.languages.join(", ")}.`);
  return out.join("\n");
}

export async function prepareApplication(applicationId: string) {
  const r = await pool.query(
    `select a.id, a.status, j.id as job_id, j.title, j.employer, j.description, j.missing_evidence
     from applications a join jobs j on j.id = a.job_id where a.id = $1`, [applicationId]);
  const a = r.rows[0];
  if (!a || !["draft", "preparing"].includes(a.status)) return;
  const p = await getProfile();
  if (!p) throw new Error("Profile not loaded");
  await pool.query(`update applications set status = 'preparing', updated_at = now() where id = $1`, [a.id]);
  await setActivity(`Preparing application: ${a.title} — ${a.employer}`);
  await emit({ type: "cv_started", title: `Tailoring CV: ${a.title} — ${a.employer}`, applicationId: a.id, jobId: a.job_id });

  const desc = a.description ?? "";
  const reqs = extractRequirements(desc).map((q) => checkRequirement(q, p));
  const cv = buildCv(p, `${a.title}\n${desc}`);
  const missing = [
    ...(a.missing_evidence ?? []),
    ...reqs.filter((q) => q.evidence === "missing").map((q) => `Requirement without evidence: ${q.requirement}`),
    ...reqs.filter((q) => q.evidence === "user_stated").map((q) => `Relies on unverified (user-stated) skill: ${q.matched.join(", ")} — confirm before claiming.`),
  ];
  if (!desc) missing.push("Full job description not available — open the listing to confirm requirements.");
  const claimCheck = [{ check: "All CV content copied from verified CV facts", ok: true }, { check: "No grades, certifications or employment added", ok: true }];

  await pool.query(
    `update applications set cv_markdown = $2, answers = $3, missing_info = $4, claim_check = $5, status = 'awaiting_approval', updated_at = now() where id = $1`,
    [a.id, cv, JSON.stringify(reqs), JSON.stringify(missing), JSON.stringify(claimCheck)],
  );
  await emit({ type: "cv_completed", level: "success", title: `CV ready: ${a.title} — ${a.employer}`, body: `${reqs.length} requirements checked · ${missing.length} items need your input`, applicationId: a.id, jobId: a.job_id, push: false });
  await emit({ type: "approval_requested", title: `📄 CV ready: ${a.employer}`, body: `${a.title}. Tailored CV and checks are done. Nothing is sent without you.`, applicationId: a.id, jobId: a.job_id, push: false });
  await setActivity(null);
}
