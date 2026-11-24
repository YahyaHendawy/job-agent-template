"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getDraft, saveDraft, finishOnboarding, type Draft } from "@/lib/onboarding";
import { extractCvText, suggestFacts, skillsInText, COMMON_SKILLS } from "@/lib/cvparse";
import { FIELDS, COUNTRIES, type Market } from "@/lib/persona";
import { enqueue } from "@/lib/queue";
import { kickRunner } from "@/lib/kick";
import { ensureScheduler } from "@/lib/scheduler";

const s = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);
const n = (f: FormData, k: string) => { const v = Number(s(f, k)); return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined; };
const list = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
const TZ: Record<string, string> = { UK: "Europe/London", IE: "Europe/Dublin", QA: "Asia/Qatar", EG: "Africa/Cairo", AE: "Asia/Dubai", SA: "Asia/Riyadh", KW: "Asia/Kuwait",
  BH: "Asia/Bahrain", OM: "Asia/Muscat", JO: "Asia/Amman", MA: "Africa/Casablanca", TR: "Europe/Istanbul", PK: "Asia/Karachi", IN: "Asia/Kolkata", MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore", US: "America/New_York", CA: "America/Toronto", DE: "Europe/Berlin", FR: "Europe/Paris", NL: "Europe/Amsterdam", AU: "Australia/Sydney" };

export async function saveCv(f: FormData) {
  await requireUser();
  const file = f.get("file");
  let text = s(f, "pasted", 60_000), filename = "";
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > 3_800_000) redirect("/welcome?step=1&error=big");
    filename = file.name.slice(0, 120);
    text = extractCvText(Buffer.from(await file.arrayBuffer()), file.name) || text;
  }
  if (text.length < 80) redirect(`/welcome?step=1&error=${filename.toLowerCase().endsWith(".pdf") ? "pdf" : "empty"}`);
  const sug = suggestFacts(text);
  const skills = skillsInText(text, [...COMMON_SKILLS, ...Object.values(FIELDS).flatMap((x) => x.skills.map((k) => k.label))]);
  await saveDraft({ cvText: text, cvFilename: filename || "CV.txt", suggestions: sug, facts: { name: sug.name, email: sug.email, phone: sug.phone, linkedin: sug.linkedin, github: sug.github, skills } });
  redirect("/welcome?step=2");
}

export async function saveFacts(f: FormData) {
  await requireUser();
  const d = await getDraft();
  const picked = (d.suggestions?.sections ?? []).map((sec, i) => ({ kind: sec.kind, lines: sec.lines.filter((_l, j) => f.get(`l-${i}-${j}`) === "on") })).filter((x) => x.lines.length);
  const skills = [...(d.facts?.skills ?? []).filter((k) => f.get(`sk-${k}`) === "on"), ...list(s(f, "moreSkills", 1000))];
  await saveDraft({ facts: { name: s(f, "name", 80), email: s(f, "email", 120), phone: s(f, "phone", 40), linkedin: s(f, "linkedin", 200), github: s(f, "github", 200),
    nationality: s(f, "nationality", 80), languages: list(s(f, "languages", 300)), picked, skills: [...new Set(skills)] } });
  redirect("/welcome?step=3");
}

export async function saveStudy(f: FormData) {
  await requireUser();
  const field = FIELDS[s(f, "field")] ? s(f, "field") : "general";
  await saveDraft({ study: { university: s(f, "university", 120), universityShort: s(f, "universityShort", 40), degree: s(f, "degree", 160), field,
    yearOfStudy: s(f, "yearOfStudy", 60), gradYear: n(f, "gradYear"), placementGradYear: n(f, "placementGradYear") ?? null,
    summerYear: n(f, "summerYear"), summerWindow: s(f, "summerWindow", 80) } });
  redirect("/welcome?step=4");
}

export async function savePlace(f: FormData) {
  await requireUser();
  const home = COUNTRIES[s(f, "home")] ? s(f, "home") : "UK";
  const codes = [home, ...Object.keys(COUNTRIES).filter((c) => f.get(`m-${c}`) === "on" && c !== home)];
  const rtw = (c: string): Market["rightToWork"] => (["citizen", "resident", "visa", "full", "unsure"].includes(s(f, `r-${c}`)) ? s(f, `r-${c}`) as Market["rightToWork"] : "unsure");
  const visa = s(f, "visa") === "uk_student" && home === "UK" ? "uk_student" : "none";
  const v = s(f, "visa");
  const homeRtw: Market["rightToWork"] = visa === "uk_student" ? "visa" : ["citizen", "full", "resident", "unsure"].includes(v) ? v as Market["rightToWork"] : "unsure";
  await saveDraft({ place: { home, city: s(f, "city", 60), visa, visaExpiry: s(f, "visaExpiry", 40), termHours: n(f, "termHours") ?? 20,
    markets: codes.map((code) => ({ code, rightToWork: code === home ? homeRtw : rtw(code) })),
    remoteOk: f.get("remoteOk") === "on", relocate: s(f, "relocate", 120), timeZone: TZ[home] ?? "Europe/London" } });
  redirect("/welcome?step=5");
}

export async function saveJobs(f: FormData) {
  await requireUser();
  const types = ["summer_internship", "placement", "part_time", "temporary", "research", "graduate", "insight_programme"].filter((t) => f.get(`t-${t}`) === "on");
  await saveDraft({ jobs: { types, keywords: list(s(f, "keywords", 600)).slice(0, 8) } });
  redirect("/welcome?step=6");
}

export async function saveDetailsStep(f: FormData) {
  await requireUser();
  const keys = ["futureSponsorship", "drivingLicence", "unspentConvictions", "addressChoice", "addressLine1", "postcode", "earliestStartSummer", "latestEndSummer", "termTimeHours", "currentAverage"];
  const details: Record<string, string> = {};
  for (const k of keys) { const v = s(f, k, 200); if (v) details[k] = v; }
  await saveDraft({ details });
  redirect("/welcome?step=7");
}

export async function saveFilters(f: FormData) {
  await requireUser();
  await saveDraft({ filters: { halal: f.get("halal") === "on", blocklist: f.get("blocklist") === "on" } });
  redirect("/welcome?step=8");
}

export async function saveNotify(f: FormData) {
  await requireUser();
  await saveDraft({ notify: { mode: s(f, "mode", 20), goal: n(f, "goal") } } as Partial<Draft>);
  await finishOnboarding();
  await ensureScheduler().catch(() => null); // first deploy usually did this already; the checklist shows the result
  const slot = `onboarding-${Date.now()}`;
  await enqueue("search_cycle", { slot, trigger: "onboarding finished" }, { dedupeKey: `cycle:${slot}` });
  kickRunner(240_000);
  revalidatePath("/");
  redirect("/welcome/connect?new=1");
}

export async function retryScheduler() {
  await requireUser();
  const r = await ensureScheduler({ force: true }).catch((e) => ({ ok: false, message: (e as Error).message }));
  redirect(`/welcome/connect?sched=${encodeURIComponent(r.message.slice(0, 200))}`);
}
