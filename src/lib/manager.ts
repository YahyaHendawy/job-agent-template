/**
 * The career manager: turns everything the app knows into priorities, a season plan, a scorecard,
 * a skills-gap plan with free courses and monthly career moves. Deterministic and free: no AI, no paid APIs.
 * Persona-aware so other people's copies get advice for their own field and country.
 */
import { pool } from "@/db";
import { persona, isUkStudent } from "@/lib/persona";
import { getProfile } from "@/profile";

export type Skill = { key: string; label: string; re: RegExp; learn: { label: string; href: string } };

/** Skills employers ask for, with one free, reputable way to learn each. Only skills that appear in your jobs are shown. */
export const SKILLS: Skill[] = [
  { key: "python", label: "Python", re: /\bpython\b/i, learn: { label: "Python for Everybody (free)", href: "https://www.py4e.com/" } },
  { key: "c", label: "C / C++", re: /\bc\+\+|\bc\/c\+\+|\bembedded c\b|\bc programming\b|\bin c\b/i, learn: { label: "learncpp.com (free)", href: "https://www.learncpp.com/" } },
  { key: "matlab", label: "MATLAB", re: /\bmatlab\b/i, learn: { label: "MATLAB Onramp (free, 2 h)", href: "https://matlabacademy.mathworks.com/details/matlab-onramp/gettingstarted" } },
  { key: "simulink", label: "Simulink", re: /\bsimulink\b/i, learn: { label: "Simulink Onramp (free)", href: "https://matlabacademy.mathworks.com/details/simulink-onramp/simulink" } },
  { key: "embedded", label: "Embedded systems / microcontrollers", re: /\bembedded\b|\bmicrocontroller|\barduino\b|\bstm32\b|\bfirmware\b/i, learn: { label: "Arduino guides (free)", href: "https://docs.arduino.cc/learn/" } },
  { key: "pcb", label: "PCB design (KiCad / Altium)", re: /\bpcb\b|\bkicad\b|\baltium\b|\bschematic capture\b/i, learn: { label: "KiCad getting started (free)", href: "https://docs.kicad.org/8.0/en/getting_started_in_kicad/getting_started_in_kicad.html" } },
  { key: "fpga", label: "FPGA / Verilog / VHDL", re: /\bfpga\b|\bverilog\b|\bvhdl\b|\bsystemverilog\b/i, learn: { label: "HDLBits practice (free)", href: "https://hdlbits.01xz.net/" } },
  { key: "circuits", label: "Analogue & digital circuits", re: /\banalog(ue)? (circuit|design|electronics)\b|\bcircuit design\b|\bdigital electronics\b/i, learn: { label: "All About Circuits textbook (free)", href: "https://www.allaboutcircuits.com/textbook/" } },
  { key: "power", label: "Power systems / electrical networks", re: /\bpower systems?\b|\bhigh voltage\b|\bsubstation|\bpower electronics\b|\bgrid\b/i, learn: { label: "MIT OpenCourseWare: power (free)", href: "https://ocw.mit.edu/search/?q=power%20electronics" } },
  { key: "signals", label: "Signal processing", re: /\bsignal processing\b|\bdsp\b/i, learn: { label: "MIT OCW: Signals and Systems (free)", href: "https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/" } },
  { key: "plc", label: "PLC / automation / control", re: /\bplc\b|\bscada\b|\bcontrol systems?\b|\bautomation\b/i, learn: { label: "OpenLearn: control & automation (free)", href: "https://www.open.edu/openlearn/search-results?q=control%20systems" } },
  { key: "cad", label: "CAD (Fusion, SolidWorks, AutoCAD)", re: /\bcad\b|\bsolidworks\b|\bautocad\b|\bfusion 360\b|\bcatia\b/i, learn: { label: "Autodesk Fusion: free education licence + tutorials", href: "https://www.autodesk.com/education/edu-software/overview" } },
  { key: "testing", label: "Lab & test equipment (oscilloscopes, testing)", re: /\boscilloscope|\btest equipment\b|\bhardware testing\b|\bvalidation\b|\bverification\b/i, learn: { label: "Tektronix: oscilloscope basics (free)", href: "https://www.tek.com/en/documents/primer/oscilloscope-basics" } },
  { key: "linux", label: "Linux", re: /\blinux\b|\bunix\b|\bbash\b/i, learn: { label: "Linux Journey (free)", href: "https://linuxjourney.com/" } },
  { key: "git", label: "Git / version control", re: /\bgit\b|\bgithub\b|\bversion control\b/i, learn: { label: "Learn Git Branching (free)", href: "https://learngitbranching.js.org/" } },
  { key: "sql", label: "SQL / databases", re: /\bsql\b|\bdatabases?\b/i, learn: { label: "SQLBolt (free)", href: "https://sqlbolt.com/" } },
  { key: "data", label: "Data analysis", re: /\bdata analys|\bpandas\b|\bpower bi\b|\btableau\b/i, learn: { label: "Kaggle Learn: Pandas (free)", href: "https://www.kaggle.com/learn/pandas" } },
  { key: "ml", label: "Machine learning / AI", re: /\bmachine learning\b|\bdeep learning\b|\bneural network|\bartificial intelligence\b/i, learn: { label: "Google ML Crash Course (free)", href: "https://developers.google.com/machine-learning/crash-course" } },
  { key: "excel", label: "Excel", re: /\bexcel\b|\bspreadsheets?\b/i, learn: { label: "Microsoft Excel training (free)", href: "https://support.microsoft.com/en-gb/excel" } },
  { key: "cloud", label: "Cloud (AWS / Azure)", re: /\baws\b|\bazure\b|\bcloud\b/i, learn: { label: "AWS Skill Builder: Cloud Essentials (free)", href: "https://skillbuilder.aws/" } },
  { key: "pm", label: "Project management", re: /\bproject management\b|\bagile\b|\bscrum\b/i, learn: { label: "OpenLearn: project management (free)", href: "https://www.open.edu/openlearn/search-results?q=project%20management" } },
  { key: "safety", label: "Health & safety awareness", re: /\bhealth (and|&) safety\b|\brisk assessment/i, learn: { label: "OpenLearn: health & safety (free)", href: "https://www.open.edu/openlearn/search-results?q=health%20and%20safety" } },
];

export type GapRow = { key: string; label: string; jobs: number; pct: number; have: boolean; learn: Skill["learn"] };

/** What employers in your open, suitable jobs ask for most, and which of those aren't on your CV yet.
 *  Cached for 6 hours (it reads hundreds of job adverts); ticking a skill as learned clears the cache. */
export async function skillGap(): Promise<{ rows: GapRow[]; sample: number }> {
  const c = (await pool.query(`select value from settings where key = 'skillGapCache' and updated_at > now() - interval '6 hours'`)).rows[0]?.value;
  if (c?.rows) return { rows: c.rows.map((g: GapRow) => ({ ...g, learn: SKILLS.find((s) => s.key === g.key)?.learn ?? g.learn })), sample: c.sample };
  const fresh = await computeSkillGap();
  await pool.query(`insert into settings (key, value, updated_at) values ('skillGapCache', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(fresh)]);
  return fresh;
}

async function computeSkillGap(): Promise<{ rows: GapRow[]; sample: number }> {
  const r = await pool.query(`select coalesce(title,'') || ' ' || coalesce(description,'') t from jobs
     where listing_status = 'open' and not dismissed and eligibility <> 'ineligible' and match_score >= 40 order by match_score desc limit 400`);
  const p = await getProfile();
  const cv = JSON.stringify(p ?? {}).toLowerCase();
  const trackDone = await learnedSkills();
  const rows = SKILLS.map((s) => {
    const n = r.rows.filter((x) => s.re.test(x.t)).length;
    return { key: s.key, label: s.label, jobs: n, pct: r.rowCount ? Math.round((n / r.rowCount) * 100) : 0, have: s.re.test(cv) || trackDone.includes(s.key), learn: s.learn };
  }).filter((x) => x.jobs > 0).sort((a, b) => b.jobs - a.jobs);
  return { rows, sample: r.rowCount ?? 0 };
}

/** Skills the owner marked as learned in the manager (they still need adding to the CV to count for matching). */
export async function learnedSkills(): Promise<string[]> {
  const r = await pool.query(`select value from settings where key = 'careerTracks'`);
  return r.rows[0]?.value?.learned ?? [];
}

/** Where you are in the hiring year, and what that means this month. */
export function season(d = new Date()) {
  const m = d.getMonth(); // 0 = Jan
  const P = persona();
  const uk = isUkStudent() || P.home.country === "UK";
  if (!uk) {
    return { title: "Always-on season", tone: "var(--accent)", advice: "Hiring runs all year in your markets. Keep a steady weekly rhythm: apply, follow up, build one skill.", next: "Check employers' own careers pages monthly." };
  }
  if (m >= 7 && m <= 10) return { title: m === 7 ? "Pre-season: applications open next month" : "Peak season: apply early", tone: "var(--bad)",
    advice: "Big employers open summer internships and placements now and many close early or as soon as they have enough people. Earlier = better odds.",
    next: "Aim to send your strongest applications before December." };
  if (m === 11 || m <= 1) return { title: "Second wave: placements, spring weeks and late openings", tone: "var(--warn)",
    advice: "Some roles close, smaller firms open. First- and second-years: spring insight weeks (Jan–Mar) are an easy way in and often lead to internships.",
    next: "Keep sending, and prepare for online tests and assessment centres." };
  if (m <= 4) return { title: "Final round: remaining summer roles", tone: "var(--warn)",
    advice: "Fewer big-company roles, more SMEs, start-ups and part-time. Interviews and assessment centres peak now.",
    next: "Say yes fast to good roles; smaller companies decide quickly." };
  return { title: "Summer: build and get ready", tone: "var(--good)",
    advice: "Few new openings. Best use of time: a portfolio project, a free course from your skills gap, and an updated CV and LinkedIn before applications open in August/September.",
    next: "Have your CV and answers ready by 1 September." };
}

/** Pipeline numbers and conversion rates. */
export async function scorecard() {
  const r = (await pool.query(`select
      count(*)::int prepared,
      count(*) filter (where status not in ('draft','preparing','awaiting_approval','failed'))::int decided,
      count(*) filter (where status = 'declined')::int declined,
      count(*) filter (where submitted_at is not null)::int sent,
      count(*) filter (where status in ('assessment','interview','offer'))::int progressed,
      count(*) filter (where status in ('interview','offer'))::int interviews,
      count(*) filter (where status = 'offer')::int offers,
      count(*) filter (where status = 'rejected' and coalesce(notes, '') not like '%"noReply"%')::int rejected,
      count(*) filter (where submitted_at > now() - interval '7 days')::int sent7,
      count(*) filter (where submitted_at > now() - interval '28 days')::int sent28
    from applications`)).rows[0];
  const weeks = (await pool.query(`select to_char(w, 'DD Mon') label, coalesce(n, 0)::int value
      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w
      left join (select date_trunc('week', submitted_at) wk, count(*) n from applications where submitted_at is not null group by 1) x on x.wk = w order by w`)).rows;
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return { ...r, responseRate: rate(r.progressed + r.rejected, r.sent), progressRate: rate(r.progressed, r.sent), interviewRate: rate(r.interviews, r.sent), weeks };
}

export type Order = { icon: string; title: string; why: string; href: string; cta: string; weight: number };

/** This week's orders: the few things that will move your career most, in order. */
export async function orders(): Promise<Order[]> {
  const q = async (sql: string) => (await pool.query(sql)).rows;
  const [[c], soonDecide, soonGo, goalRow, gap] = await Promise.all([
    q(`select (select count(*)::int from emails where needs_action and handled_at is null) mail,
              (select count(*)::int from applications where status = 'approved') going,
              (select count(*)::int from applications where status = 'awaiting_approval') decide,
              (select count(*)::int from applications where status in ('assessment','interview')) stage,
              (select count(*)::int from applications where status = 'offer') offer,
              (select count(*)::int from applications where submitted_at > date_trunc('week', now())) sent_week,
              (select count(*)::int from applications where status = 'submitted' and submitted_at < now() - interval '14 days'
                 and not exists (select 1 from emails e where e.application_id = applications.id and e.received_at > applications.submitted_at and e.category <> 'received')
                 and coalesce(substring(applications.notes from '"chaseAfter":"([^"]+)"'), '1970-01-01')::timestamptz < now()) chase`),
    q(`select a.id, j.employer from applications a join jobs j on j.id = a.job_id where a.status = 'awaiting_approval' and j.deadline between now() and now() + interval '4 days' order by j.deadline limit 3`),
    q(`select a.id, j.employer from applications a join jobs j on j.id = a.job_id where a.status = 'approved' and j.deadline between now() and now() + interval '4 days' order by j.deadline limit 3`),
    q(`select value from settings where key = 'goals'`),
    skillGap(),
  ]);
  const goal = goalRow[0]?.value?.applicationsPerWeek ?? 5;
  const o: Order[] = [];
  if (c.offer) o.push({ icon: "🎉", weight: 100, title: `Respond to ${c.offer > 1 ? `${c.offer} offers` : "your offer"}`, why: "Offers have deadlines. Check dates fit your studies and visa, then reply.", href: "/applications?tab=offers", cta: "Open" });
  if (c.stage) o.push({ icon: "🎤", weight: 95, title: `Prepare for ${c.stage} test${c.stage > 1 ? "s/interviews" : " or interview"}`, why: "This is the stage that turns applications into offers. 1 hour of prep each makes a real difference.", href: "/applications?tab=progress", cta: "Prep" });
  for (const a of soonGo) o.push({ icon: "⏰", weight: 92, title: `Send ${a.employer} before it closes`, why: "You already said yes and the deadline is within 4 days.", href: `/applications/${a.id}#next-steps`, cta: "Send" });
  if (c.mail) o.push({ icon: "📧", weight: 90, title: `Answer ${c.mail} email${c.mail > 1 ? "s" : ""}`, why: "Replies within 24 hours look professional; slow replies lose interview slots.", href: "/todo#emails", cta: "Reply" });
  for (const a of soonDecide) o.push({ icon: "⏳", weight: 85, title: `Decide on ${a.employer} (closes soon)`, why: "Closing within 4 days. Yes or no takes a minute.", href: `/applications/${a.id}`, cta: "Decide" });
  if (c.going) o.push({ icon: "📨", weight: 80, title: `Send ${c.going} application${c.going > 1 ? "s" : ""} you said yes to`, why: "They're prepared; only Submit is left. Every day open means more competition.", href: "/todo#send", cta: "Send" });
  if (c.sent_week < goal) o.push({ icon: "🎯", weight: 70, title: `Send ${goal - c.sent_week} more this week to hit your goal of ${goal}`, why: "Applications are a numbers game; a steady weekly rhythm beats bursts.", href: c.decide ? "/applications?tab=approval&sort=verdict" : "/jobs", cta: c.decide ? "Pick the best" : "Find jobs" });
  if (c.decide) o.push({ icon: "🤔", weight: 75, title: `Decide on ${Math.min(c.decide, 10)} of your ${c.decide} prepared applications`, why: "Sorted best first. About a minute each; every yes is one step from being sent.", href: "/applications?tab=approval&sort=verdict", cta: "Start" });
  const top = gap.rows.find((g) => !g.have);
  if (top) o.push({ icon: "🧠", weight: 55, title: `Learn ${top.label}`, why: `${top.jobs} of your ${gap.sample} best-matching jobs ask for it and it isn't on your CV. Free: ${top.learn.label}.`, href: "/manager#skills", cta: "Start" });
  if (c.chase) o.push({ icon: "🔁", weight: 45, title: `Follow up or close ${c.chase} silent application${c.chase > 1 ? "s" : ""}`, why: "Two weeks without a reply. A polite check-in can revive one; closing keeps your list honest.", href: "/todo#chase", cta: "Review" });
  o.push({ icon: "🤝", weight: 40, title: "One networking action", why: "Many internships are filled through people. Message one engineer or alum, or go to one event.", href: "/todo#sites", cta: "Ideas" });
  return o.sort((a, b) => b.weight - a.weight);
}

export type Move = { id: string; icon: string; title: string; why: string; links: { label: string; href: string }[] };

/** Monthly career moves that build a standout profile over time (ticked per month). */
export function moves(topGap?: GapRow): Move[] {
  const P = persona();
  const field = P.fieldName || "your field";
  return [
    { id: "project", icon: "🛠️", title: "Push one project forward (and put it on GitHub)", why: `A small, finished ${field} project with photos and a short write-up is the strongest thing on a student CV.`, links: [{ label: "GitHub (free)", href: "https://github.com/new" }] },
    { id: "skill", icon: "🧠", title: topGap ? `Finish a free course: ${topGap.label}` : "Finish one free course", why: "Close the gap employers ask about most. Add it to your CV when done.", links: topGap ? [{ label: topGap.learn.label, href: topGap.learn.href }] : [] },
    { id: "people", icon: "🤝", title: "4 networking conversations (one a week)", why: "Ask people in roles you want how they got there. Referrals beat cold applications.", links: P.university ? [{ label: `LinkedIn: ${P.universityShort || P.university} alumni`, href: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${P.university} ${field}`)}` }] : [] },
    { id: "post", icon: "📣", title: "Share one thing you built or learned on LinkedIn", why: "Recruiters look at activity. One short post a month with a photo is enough.", links: [{ label: "LinkedIn", href: "https://www.linkedin.com/feed/" }] },
    ...(P.fieldName === "engineering" ? [{ id: "body", icon: "🏛️", title: "Use your IET student membership (events, mentoring)", why: "Free for students; events and mentors in industry, and it looks good on a CV.", links: [{ label: "IET student membership", href: "https://www.theiet.org/membership/student-membership/" }] }] : []),
    { id: "cv", icon: "📄", title: "Update your CV and Application details", why: "New skills, grades or projects raise your match scores on every job straight away.", links: [{ label: "Application details", href: "/settings/details" }] },
  ];
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function tracksState() {
  const r = await pool.query(`select value from settings where key = 'careerTracks'`);
  const v = r.rows[0]?.value ?? {};
  return { month: monthKey(), done: (v.month === monthKey() ? v.done : []) as string[], learned: (v.learned ?? []) as string[] };
}
