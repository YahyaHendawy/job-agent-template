/** The weekly "do it yourself" routine, with direct links, and stage-by-stage help. */
import { pool } from "@/db";

import { persona, COUNTRIES, countryName, isUkStudent, type WeeklyItem } from "@/lib/persona";
export type { WeeklyItem };

const q = encodeURIComponent;
/** The weekly routine: the owner's own list if saved, otherwise built from their countries and keywords. */
export function weekly(): WeeklyItem[] {
  const P = persona();
  if (P.weekly?.length) return P.weekly;
  const kws = P.keywords.length ? P.keywords.slice(0, 3) : ["internship"];
  const places = P.markets.map((m) => ({ code: m.code, name: m.code === P.home.country && P.home.city ? P.home.city : countryName(m.code) }));
  const items: WeeklyItem[] = [
    { id: "linkedin", title: "LinkedIn: new roles this week", why: "Lots of roles are only posted here. Save anything good with “Add a job by link”.",
      links: places.flatMap((p) => kws.slice(0, 2).map((k) => ({ label: `${k} (${p.name})`, href: `https://www.linkedin.com/jobs/search/?keywords=${q(k)}&location=${q(p.name)}&f_TPR=r604800` }))) },
    { id: "indeed", title: "Indeed: last 7 days", why: "Indeed doesn't allow automated reading, so a quick look each week.",
      links: places.filter((p) => COUNTRIES[p.code]?.indeed).map((p) => ({ label: `${kws[0]} (${p.name})`, href: `https://${COUNTRIES[p.code].indeed}/jobs?q=${q(kws[0])}&l=${q(p.name)}&fromage=7` })) },
    { id: "student", title: "Student job boards and your careers service", why: "Placement and internship specialists.",
      links: [
        ...(P.markets.some((m) => m.code === "UK") ? [{ label: "Gradcracker", href: "https://www.gradcracker.com/" }, { label: "RateMyPlacement", href: `https://www.ratemyplacement.co.uk/search?keywords=${q(kws[0])}` }, { label: "Bright Network", href: "https://www.brightnetwork.co.uk/search/?content_types=jobs" }] : []),
        ...(P.university ? [{ label: `${P.universityShort || P.university} careers`, href: `https://www.google.com/search?q=${q(`${P.university} careers student jobs`)}` }] : []),
      ] },
    { id: "network", title: "One networking action", why: "Many internships come from people, not adverts. Message one person in a role you'd like, or go to one careers event.",
      links: P.university ? [{ label: `LinkedIn: ${P.universityShort || P.university} alumni`, href: `https://www.linkedin.com/search/results/people/?keywords=${q(`${P.university} ${kws[0]}`)}` }] : [] },
  ];
  return items.filter((i) => i.links.length || i.id === "network");
}

export const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((+t - +y) / 86400000 + 1) / 7)).padStart(2, "0")}`;
};

export async function weeklyState() {
  const r = await pool.query(`select value from settings where key = 'weeklyChecklist'`);
  const v = r.rows[0]?.value ?? {};
  const wk = weekKey();
  return { week: wk, done: (v.week === wk ? v.done : []) as string[] };
}

export async function toggleWeekly(id: string) {
  const st = await weeklyState();
  const done = st.done.includes(id) ? st.done.filter((x) => x !== id) : [...st.done, id];
  await pool.query(`insert into settings (key, value, updated_at) values ('weeklyChecklist', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ week: st.week, done })]);
}

/** Help for each stage after applying. Call after loadPersona() (visa and university wording). */
export const stages = (): Record<string, { title: string; steps: string[]; links?: { label: string; href: string }[]; questions?: string[] }> => ({
  assessment: {
    title: "Online test: how to get through it",
    steps: [
      "Find the deadline in the email and do it at least a day early.",
      "Do 2–3 free practice tests of the same type first (numerical, verbal, logical or coding).",
      "Quiet room, laptop on charge, calculator and paper ready (unless told otherwise).",
      "Read each question fully; skip and come back if stuck — most tests are timed per section.",
      "When finished, nothing else to do — the app moves this forward automatically when their next email arrives.",
    ],
    links: [
      { label: "Free practice: numerical / verbal / logical (Prospects)", href: "https://www.prospects.ac.uk/careers-advice/interview-tips/psychometric-tests" },
      { label: "Free practice: coding (HackerRank)", href: "https://www.hackerrank.com/domains/tutorials/10-days-of-javascript" },
      { label: "Practice video interviews (Prospects tips)", href: "https://www.prospects.ac.uk/careers-advice/interview-tips/video-interview-tips" },
    ],
  },
  interview: {
    title: "Interview: step-by-step prep",
    steps: [
      "Reply to book a slot (Needs you → Reply), then save the date below so it goes in your calendar.",
      "Read the job description again and the company's website/news for 15 minutes.",
      "Write short answers to the questions below in your own words (STAR: Situation, Task, Action, Result).",
      "Prepare 2 questions to ask them (e.g. what a typical week looks like, what interns usually work on).",
      "Day before: test your camera/route, plan to be 10 minutes early, have your CV open.",
      "After: send a short thank-you email (Reply from the app) the same day.",
    ],
    questions: [
      "Tell me about yourself",
      "Why this company and this role?",
      "Describe a technical project you worked on and your part in it",
      "Tell me about a time you solved a problem or fixed something that wasn't working",
      "Tell me about a time you worked in a team / led others",
      "What would you like to learn in this role?",
    ],
    links: [{ label: "Interview tips incl. STAR method (Prospects)", href: "https://www.prospects.ac.uk/careers-advice/interview-tips" }],
  },
  offer: {
    title: "Offer: what to check before you say yes",
    steps: [
      ...(isUkStudent() ? [`Dates: the work must fit your Student visa — full-time only in official ${persona().universityShort || "university"} vacations, max ${persona().visa.termHours} hours/week in term time.`] : ["Dates: check the start and end dates fit your studies and plans."]),
      "Pay, hours, location and start/end dates are written in the offer.",
      ...(isUkStudent() ? ["Right to work: the employer will ask for a share code — get it from gov.uk “Prove your right to work” (link below)."] : ["Right to work: have your passport or permit ready; the employer will check it."]),
      "If you have other applications in progress, it's fine to ask for a few days to decide.",
      "Reply to accept (or ask questions) from Needs you → Reply, straight from the app.",
    ],
    links: [
      ...(isUkStudent() ? [{ label: "Get your right-to-work share code (gov.uk)", href: "https://www.gov.uk/prove-right-to-work" }] : []),
      ...(isUkStudent() ? [{ label: "Student visa work rules (gov.uk)", href: "https://www.gov.uk/student-visa/what-you-can-and-cannot-do" }] : []),
    ],
  },
  rejected: {
    title: "Not this time — what to do next",
    steps: [
      "It's normal: most students get many rejections before an offer. The agent is still searching for you.",
      "Optional: ask for feedback — there's a polite email ready below.",
      "If you got far (interview/test), note what you'd do differently in “Your answers” to reuse next time.",
    ],
  },
});
