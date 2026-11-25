import Link from "next/link";
import { LimitsNote } from "@/components/Limits";
import { COUNTRIES } from "@/lib/persona";
import { CompareToggle } from "@/components/Compare";
import { notFound } from "next/navigation";
import { pool } from "@/db";
import { verdict } from "@/lib/verdict";
import { VerdictView } from "@/components/Verdict";
import { ChanceView, ChanceChip } from "@/components/Chance";
import { chance } from "@/lib/chance";
import { applicantsModel } from "@/lib/applicants";
import { ApplicantsCounter } from "@/components/Applicants";
import { RecruiterEmail } from "@/components/RecruiterEmail";
import { APP_STATUS, CATEGORY, ELIG, fmtTime, fmtDate, timeAgo } from "@/components/ui";
import { markSubmitted, setApplicationStatus, decideYes, decideNo, decideLater, reconsider } from "@/app/actions";
import { Markdown } from "@/components/Markdown";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ApplyKit } from "@/components/ApplyKit";
import { YourAnswers } from "@/components/YourAnswers";
import { StageGuide } from "@/components/StageGuide";
import { Stepper } from "@/components/charts";
import { stages } from "@/lib/guide";
import { keyOf, questionsFor, suggestionsFor } from "@/lib/written";
import { getProfile } from "@/profile";
import { getDetails } from "@/lib/details";
import { standardAnswers, writingPrompts, currentAge } from "@/lib/answers";
import { readNotes } from "@/lib/goahead";

const EVIDENCE_COLOR: Record<string, string> = { verified: "var(--good)", user_stated: "var(--warn)", missing: "var(--bad)", general: "var(--muted)" };
const EVIDENCE_LABEL: Record<string, string> = { verified: "On your CV", user_stated: "You said: confirm", missing: "Not on your CV", general: "General" };
const COUNTRY = new Proxy({} as Record<string, string>, { get: (_t, c: string) => (c === "OTHER" ? "Other" : COUNTRIES[c] ? `${COUNTRIES[c].flag} ${COUNTRIES[c].name}` : undefined) });
const SOURCE: Record<string, string> = { reed: "Reed.co.uk", jooble: "Jooble", adzuna: "Adzuna", careerjet: "Careerjet" };

/** The same sections, in the same order, for every application. */
function Section({ n, title, id, children, right }: { n: number; title: string; id?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id={id} className="card p-4 scroll-mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: "var(--surface-2)" }}>{n}</span>
        <h2 className="font-bold flex-1">{title}</h2>{right}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="py-2 grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={empty ? "text-muted italic" : "font-medium"} style={tone ? { color: tone } : undefined}>{empty ? "Not stated in the advert" : value}</dd>
    </div>
  );
}

function Step({ done, warn, title, sub, href, cta }: { done: boolean | null; warn?: boolean; title: string; sub?: string; href?: string; cta?: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="text-lg leading-none mt-0.5">{done ? "✅" : warn ? "⚠️" : done === null ? "⏳" : "⬜️"}</span>
      <div className="flex-1 min-w-0"><p className={`text-sm ${done ? "text-muted line-through" : "font-semibold"}`}>{title}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
      {href && !done && <a href={href} className="btn btn-ghost !py-1 !text-xs shrink-0">{cta ?? "Open"}</a>}
    </li>
  );
}

export default async function AppDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; decided?: string; mail?: string }> }) {
  const { id } = await params;
  const { from, decided, mail } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await pool.query(
    `select a.*, j.title, j.employer, j.application_url, j.source_url, j.id as job_id, j.category, j.country, j.description, j.location, j.match_score,
            j.match_reasons, j.eligibility, j.eligibility_reasons, j.missing_evidence, j.salary, j.deadline, j.start_date, j.duration, j.employment_type,
            j.discovered_at, j.last_verified_at, j.listing_status, s.kind as source_kind, s.employer as source_name
     from applications a join jobs j on j.id = a.job_id left join sources s on s.id = j.source_id where a.id = $1`, [id]);
  const a = r.rows[0];
  if (!a) notFound();
  const notes = readNotes(a.notes);
  const [profile, details, left] = await Promise.all([
    getProfile(), getDetails(),
    pool.query(`select count(*)::int n from applications where status = 'awaiting_approval'`).then((x) => x.rows[0].n as number),
  ]);
  const kit = profile && a.cv_markdown ? { answers: standardAnswers(a, profile, details), ...writingPrompts(a, profile) } : null;
  const stageQs = a.status === "interview" ? (stages().interview.questions ?? []).map((q) => ({ key: `interview:${keyOf(q)}`, question: q, guide: "Bullet points are fine. Use a real example from your CV.", source: "standard" as const })) : [];
  const qs = [...stageQs, ...questionsFor(a)];
  const rejection = a.status === "rejected" ? (await pool.query(`select id from emails where application_id = $1 and category = 'rejection' order by received_at desc limit 1`, [a.id])).rows[0]?.id : null;
  const answersUI = await Promise.all(qs.map(async (q) => {
    const w = (a.written ?? []).find((x: any) => x.key === q.key);
    return { ...q, answer: w?.answer ?? "", suggestions: w?.answer ? [] : (await suggestionsFor(q.question)).map((s) => ({ question: s.question, answer: s.answer })) };
  }));
  const ev = await pool.query(`select id, ts, title, level from events where application_id = $1 order by id desc limit 20`, [id]);

  const v = verdict(a, { age: currentAge(details as any) });
  const ch = chance({ ...a, answers: a.answers, unanswered: answersUI.filter((q) => !q.answer.trim()).length });
  const pre = ["awaiting_approval", "approved", "draft", "preparing", "declined"].includes(a.status);
  const unanswered = answersUI.filter((q) => !q.answer.trim());
  const dv = details as Record<string, any>;
  const missingDetails = [...(dv.addressChoice === "area-only" ? [] : ["addressLine1"]), "postcode", "visaExpiry", "earliestStartSummer", "latestEndSummer", "drivingLicence", "unspentConvictions"].filter((k) => !dv[k]).length;
  const minutes = unanswered.length * 5 + (missingDetails ? 3 : 0) + 10;
  const days = a.deadline ? Math.ceil((Date.parse(a.deadline) - Date.now()) / 86400000) : null;
  const deadlineText = a.deadline ? `${fmtDate(a.deadline)} · ${days! < 0 ? "passed" : days === 0 ? "closes today" : days === 1 ? "closes tomorrow" : `${days} days left`}` : null;
  const reqs = (a.answers as any[]) ?? [];
  const reqCount = { ok: reqs.filter((q) => q.evidence === "verified").length, gap: reqs.filter((q) => q.evidence === "missing").length };
  const applyHref = a.application_url ? `${a.application_url.split("#")[0]}#jobagent=${a.id}` : null;
  const checking = a.status === "approved" && !notes.advertCheck && a.approved_at && Date.now() - Date.parse(a.approved_at) < 60_000;
  let n = 0;

  return (
    <div className="space-y-4">
      {(["draft", "preparing"].includes(a.status) || checking) && <AutoRefresh seconds={3} />}
      <div className="flex items-center gap-3 text-sm">
        <Link href="/applications" className="text-accent font-semibold">← Applications</Link>
        {from === "decided" && <span className="text-muted">✓ Saved. Next one ({left} left to decide)</span>}
        {from === "later" && <span className="text-muted">Skipped for now. Next one ({left} left)</span>}
      </div>

      {(a.status === "offer" || String(a.notes ?? "").includes('"opportunity"')) && (
        <Link href={`/work/${a.id}`} className="card p-3 gradient-hero flex items-center gap-2 font-semibold">🎉 <span className="flex-1">Offer: manage it in My job</span><span className="text-accent">→</span></Link>
      )}

      {/* Header + decision: always first */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <span className="chip">{APP_STATUS[a.status] ?? a.status}</span>
          <span className="chip font-semibold" style={{ color: v.tone === "good" ? "var(--good)" : v.tone === "bad" ? "var(--bad)" : v.tone === "warn" ? "var(--warn)" : "var(--accent)" }}>{v.call}</span>
          <ChanceChip c={ch} />
          <ApplicantsCounter m={applicantsModel(a)} compact />
          {a.match_score != null && <span className="chip ml-auto">{a.match_score}% match</span>}
          <CompareToggle jobId={a.job_id} label={a.employer} />
        </div>
        <h1 className="text-xl font-bold leading-snug">{a.title}</h1>
        <p className="text-muted"><Link href={`/jobs/${a.job_id}`} className="underline">{a.employer}</Link> · {a.location ?? COUNTRY[a.country]}</p>
        <div className="mt-3"><Stepper status={a.status} /></div>

        {a.status === "awaiting_approval" && (
          <div className="mt-4 rounded-xl p-3 space-y-3" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm"><b>Your decision.</b> Read the summary below, then choose. About <b>{minutes} min</b> of your time if you go ahead{deadlineText ? ` · deadline ${deadlineText}` : ""}.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <form action={decideYes.bind(null, a.id)}><button className="btn btn-primary w-full !py-3 !text-base">✅ Yes, apply</button></form>
              <form action={decideNo.bind(null, a.id)} className="flex gap-2">
                <select name="reason" defaultValue="" className="input !py-2 !text-sm flex-1" aria-label="Reason (optional)">
                  <option value="">Reason (optional)</option>
                  <option value="not_interested">Not interested in the role</option><option value="location">Location doesn't work</option>
                  <option value="dates">Dates don't fit my studies</option><option value="eligibility">Don't think I'm eligible</option>
                  <option value="employer">Not this employer</option><option value="too_much">Too much work for the chance</option><option value="other">Other</option>
                </select>
                <button className="btn btn-ghost !py-3 shrink-0">👎 No</button>
              </form>
            </div>
            <form action={decideLater.bind(null, a.id)} className="text-right"><button className="text-sm text-accent font-semibold">Decide later →</button></form>
            <p className="text-xs text-muted">✅ Yes: I reuse your earlier answers, check the advert is still open and set out the last steps. 👎 No: it moves to Applications → Not doing (you can bring it back any time). Either way the next one opens.</p>
          </div>
        )}

        {a.status === "declined" && (
          <div className="mt-4 rounded-xl p-3 flex flex-wrap items-center gap-2" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm flex-1">👎 <b>Not doing</b>: {notes.decision?.reasonText ?? "no reason given"}{notes.decision?.at ? ` · ${timeAgo(notes.decision.at)}` : ""}</p>
            <form action={reconsider.bind(null, a.id)}><button className="btn btn-ghost !text-sm">↩︎ Reconsider</button></form>
            <form action={decideYes.bind(null, a.id)}><button className="btn btn-primary !text-sm">✅ Apply after all</button></form>
          </div>
        )}

        {a.status === "approved" && (
          <div id="next-steps" className="mt-4 rounded-xl p-3 scroll-mt-4" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm font-semibold mb-1">{decided === "yes" ? "✅ Going ahead! Here's what's left:" : "Going ahead. What's left:"}</p>
            <ol className="divide-y divide-line">
              <Step done title="You said yes" sub={a.approved_at ? fmtTime(a.approved_at) : undefined} />
              <Step done={notes.advertCheck ? notes.advertCheck.ok !== false : null} warn={notes.advertCheck?.ok === false}
                title={notes.advertCheck ? notes.advertCheck.note : "Checking the advert is still open…"} sub={notes.advertCheck?.at ? `checked ${timeAgo(notes.advertCheck.at)}` : undefined}
                href={notes.advertCheck?.ok === false ? a.source_url ?? a.application_url ?? undefined : undefined} cta="See advert" />
              <Step done={unanswered.length === 0} title={unanswered.length ? `Write ${unanswered.length} short answer${unanswered.length > 1 ? "s" : ""} in your own words` : "Your answers are written"}
                sub={notes.reusedAnswers ? `${notes.reusedAnswers} reused from answers you wrote before` : unanswered.length ? "About 5 minutes each; employers check these for AI" : undefined} href="#answers" cta="Write" />
              <Step done={missingDetails === 0} title={missingDetails ? `Fill in ${missingDetails} application detail${missingDetails > 1 ? "s" : ""}` : "Your application details are complete"} href="/settings/details" cta="Fill in" />
              <Step done={false} title="Send it: on your Mac, tap Apply now" sub="Safari opens the form and Job Agent fills everything in. On iPhone, use the Apply Kit below." href={applyHref ?? undefined} cta="Apply now ↗" />
              <Step done={!!notes.recruiterEmail} title={notes.recruiterEmail ? "Recruiter emailed" : "Optional: email the recruiter too"} sub="Your choice: the form, an email, or both" href="#recruiter" cta="Email" />
              <Step done={false} title="Done: recorded by itself" sub="The confirmation page or the employer's confirmation email marks it as submitted. No need to do anything." />
            </ol>
            {applyHref && <a href={applyHref} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full mt-3 !py-3 !text-base">Apply now ↗</a>}
            <form action={markSubmitted.bind(null, a.id)} className="mt-3 flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-52 text-xs"><span className="text-muted font-semibold">Sent it another way? Confirmation number or email subject</span>
                <input name="evidence" className="input mt-1 !py-2" minLength={4} required /></label>
              <button className="btn btn-ghost !text-sm">Record as sent</button>
            </form>
            <form action={decideNo.bind(null, a.id)} className="text-right mt-2"><input type="hidden" name="reason" value="other" /><button className="text-xs text-muted underline">Changed my mind: don't apply</button></form>
          </div>
        )}

        {["submitted", "assessment", "interview"].includes(a.status) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {["assessment", "interview", "offer", "rejected", "withdrawn"].map((s) => (
              <form key={s} action={setApplicationStatus.bind(null, a.id, s)}><button className="btn btn-ghost !text-sm">Mark {s}</button></form>
            ))}
          </div>
        )}
        {a.submission_evidence && <p className="text-sm mt-3">Sent: {a.submission_evidence.reference} ({a.submission_evidence.kind.replace(/_/g, " ")}, {fmtTime(a.submission_evidence.at)})</p>}
      </div>

      {["awaiting_approval", "approved"].includes(a.status) && <LimitsNote topic="apply" max={4} />}

      {!pre && <div id="stage-help" className="scroll-mt-20"><StageGuide app={a} rejectionEmailId={rejection} /></div>}

      <Section n={++n} title="At a glance">
        <dl className="divide-y divide-line">
          <Fact label="Role" value={a.title} />
          <Fact label="Employer" value={a.employer === "Unknown employer" ? "Not named (agency advert)" : a.employer} />
          <Fact label="Type" value={CATEGORY[a.category] ?? a.category} />
          <Fact label="Location" value={a.location} />
          <Fact label="Country" value={COUNTRY[a.country] ?? a.country} />
          <Fact label="Pay" value={a.salary} />
          <Fact label="Hours / contract" value={a.employment_type} />
          <Fact label="Start date" value={a.start_date} />
          <Fact label="Length" value={a.duration} />
          <Fact label="Deadline" value={deadlineText} tone={days != null && days <= 7 ? "var(--bad)" : undefined} />
          <Fact label="Your visa" value={ELIG[a.eligibility]?.label} tone={ELIG[a.eligibility]?.color} />
          <Fact label="Match" value={a.match_score != null ? `${a.match_score}%` : null} />
          <Fact label="Requirements" value={reqs.length ? `${reqCount.ok} of ${reqs.length} shown on your CV${reqCount.gap ? ` · ${reqCount.gap} not` : ""}` : null} />
          <Fact label="Your time" value={pre ? `About ${minutes} min (${unanswered.length} answer${unanswered.length === 1 ? "" : "s"} to write)` : null} />
          <Fact label="Found" value={`${a.source_kind ? SOURCE[a.source_kind] ?? `${a.source_name} careers page` : "Added by you"} · ${timeAgo(a.discovered_at)}`} />
          <Fact label="Advert" value={a.listing_status === "closed" ? "Closed" : `Open · checked ${timeAgo(a.last_verified_at)}`} tone={a.listing_status === "closed" ? "var(--bad)" : undefined} />
        </dl>
        {(a.source_url || a.application_url) && <a href={a.source_url ?? a.application_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full mt-3 !text-sm">Read the original advert ↗</a>}
      </Section>

      <Section n={++n} title="Should you apply?"><VerdictView v={v} /></Section>

      {!["declined", "withdrawn"].includes(a.status) && <Section n={++n} title="Email the recruiter" id="recruiter"><RecruiterEmail app={a} flash={mail} /></Section>}

      <Section n={++n} title="Chance of getting it"><div className="space-y-3"><ApplicantsCounter m={applicantsModel(a)} /><ChanceView c={ch} /></div></Section>

      <Section n={++n} title="Visa & eligibility" right={<span className="chip" style={{ color: ELIG[a.eligibility]?.color }}>{ELIG[a.eligibility]?.label}</span>}>
        <ul className="space-y-1.5 text-sm">{((a.eligibility_reasons as string[]) ?? []).map((x, i) => <li key={i}>• {x}</li>)}</ul>
        {((a.missing_evidence as string[]) ?? []).length > 0 && (
          <><p className="text-sm font-semibold mt-3 mb-1">Worth confirming</p>
            <ul className="space-y-1 text-sm text-muted">{(a.missing_evidence as string[]).map((x, i) => <li key={i}>• {x}</li>)}</ul></>
        )}
      </Section>

      <Section n={++n} title="What they ask for vs your CV" right={reqs.length ? <span className="text-xs text-muted">{reqCount.ok}/{reqs.length} on your CV</span> : undefined}>
        {reqs.length ? (
          <ul className="space-y-2 text-sm">
            {[...reqs].sort((x, y) => ["missing", "user_stated", "general", "verified"].indexOf(x.evidence) - ["missing", "user_stated", "general", "verified"].indexOf(y.evidence)).map((q, i) => (
              <li key={i} className="flex gap-2"><span className="chip shrink-0" style={{ color: EVIDENCE_COLOR[q.evidence] }}>{EVIDENCE_LABEL[q.evidence]}</span><span>{q.requirement}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">The advert doesn't list clear requirements. Read it below to be sure.</p>}
      </Section>

      {kit && ["awaiting_approval", "approved", "draft", "preparing", "interview", "declined"].includes(a.status) && (
        <YourAnswers appId={a.id} questions={answersUI} facts={kit.facts} />
      )}

      {kit && ["awaiting_approval", "approved"].includes(a.status) && (
        <Section n={++n} title="Apply Kit (for iPhone or other forms)">
          <ApplyKit answers={kit.answers} facts={kit.facts} prompts={kit.prompts} cvUrl={`/api/applications/${a.id}/cv`} applyUrl={a.application_url} />
        </Section>
      )}

      <Section n={++n} title="Your tailored CV" right={<a href={`/api/applications/${a.id}/cv`} className="text-xs text-accent font-semibold">Download</a>}>
        {a.cv_markdown ? <div className="prose-cv text-sm"><Markdown text={a.cv_markdown} /></div> : <p className="text-sm text-muted">Being prepared…</p>}
        <p className="text-xs text-muted mt-3">Built only from facts on your CV, reordered for this job. Nothing invented.</p>
      </Section>

      <Section n={++n} title="The full advert">
        {a.description ? (
          <details><summary className="text-sm font-semibold cursor-pointer text-accent">Show the job description ({Math.max(1, Math.round(a.description.split(/\s+/).length / 200))} min read)</summary>
            <div className="text-sm whitespace-pre-line mt-2 text-muted">{a.description}</div></details>
        ) : <p className="text-sm text-muted">The full text wasn't available. Use “Read the original advert” above.</p>}
      </Section>

      <Section n={++n} title="History">
        <ul className="text-sm space-y-1">{ev.rows.map((e) => <li key={e.id}><span className="text-muted tabular-nums">{fmtTime(e.ts)}</span> · {e.title}</li>)}</ul>
      </Section>
    </div>
  );
}
