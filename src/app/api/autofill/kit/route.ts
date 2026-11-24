import { pool } from "@/db";
import { tokenUser, CORS } from "@/lib/auth";
import { getProfile } from "@/profile";
import { getDetails } from "@/lib/details";
import { currentAge } from "@/lib/answers";
import { standardAnswers, writingPrompts } from "@/lib/answers";
import { cvPdf } from "@/lib/cvpdf";
import { getSettings } from "@/lib/settings";
import { persona } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

const norm = (u: string) => {
  try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname).replace(/\/(apply|application)\/?$/, "").replace(/\/+$/, "").toLowerCase(); }
  catch { return ""; }
};

/**
 * Returns the fill kit for the application matching the page URL, or the list of ready
 * applications so the user can pick one.
 */
export async function GET(req: Request) {
  const u = await tokenUser(req);
  if (!u) return Response.json({ error: "Not connected. Open Job Agent → Settings → Connect this Mac." }, { status: 401, headers: CORS });
  const pageUrl = new URL(req.url).searchParams.get("url") ?? "";
  const pick = new URL(req.url).searchParams.get("applicationId");
  const apps = (await pool.query(
    `select a.id, a.status, a.cv_markdown, a.written, j.title, j.employer, j.category, j.country, j.description, j.application_url, j.source_url
     from applications a join jobs j on j.id = a.job_id
     where a.status in ('awaiting_approval','approved') and a.cv_markdown is not null order by j.match_score desc`)).rows;
  const target = norm(pageUrl);
  const app = pick ? apps.find((a) => a.id === pick)
    : apps.find((a) => [a.application_url, a.source_url].some((x) => x && target && (target.startsWith(norm(x)) || norm(x).startsWith(target))));
  if (!app) {
    return Response.json({ match: null, ready: apps.map((a) => ({ id: a.id, title: a.title, employer: a.employer })) }, { headers: CORS });
  }
  const [profile, details, settings] = await Promise.all([getProfile(), getDetails(), getSettings()]);
  if (!profile) return Response.json({ error: "Profile missing" }, { status: 500, headers: CORS });
  const answers = standardAnswers(app, profile, details);
  const writing = writingPrompts(app, profile);
  const pdf = await cvPdf(app.cv_markdown, `${profile.name} - CV`);
  return Response.json({
    match: { id: app.id, title: app.title, employer: app.employer },
    age: currentAge(details),
    details: { ...details, university: profile.education?.[0]?.institution, degree: profile.education?.[0]?.degree, graduationYear: String(app.category === "placement" && persona().gradYearPlacement ? persona().gradYearPlacement : persona().gradYear), discipline: persona().degreeSubject || profile.education?.[0]?.degree },
    answers,
    writing,
    written: (app.written ?? []).filter((w: any) => w.answer?.trim()).map((w: any) => ({ question: w.question, answer: w.answer })),
    automation: { autoSubmit: settings.automation.autoSubmit && app.category !== "placement", autoConsent: settings.automation.autoConsent },
    cv: { filename: `${profile.name.replace(/\s+/g, "_")}_CV.pdf`, base64: Buffer.from(pdf).toString("base64") },
  }, { headers: { ...CORS, "Cache-Control": "no-store" } });
}
