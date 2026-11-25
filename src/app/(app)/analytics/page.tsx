import Link from "next/link";
import { pool } from "@/db";
import { PageHeader, CATEGORY, ELIG } from "@/components/ui";
import { Donut, Progress, PALETTE } from "@/components/charts";
import { loadPersona, countryName } from "@/lib/persona";
import { verdict } from "@/lib/verdict";
import { chance } from "@/lib/chance";
import { skillGap } from "@/lib/manager";
import { unanswered } from "@/lib/written";

export const dynamic = "force-dynamic";

const COLORS = [PALETTE.blue, PALETTE.violet, PALETTE.teal, PALETTE.amber, PALETTE.green, "#f472b6", "#60a5fa", PALETTE.red, "#a3a3a3"];
const seg = (rows: [string, number][]) => rows.filter(([, v]) => v > 0).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Personal analytics: where your applications are, what they're made of, and where you're weakest. */
export default async function Analytics() {
  await loadPersona();
  const [apps, emails, gap] = await Promise.all([
    pool.query(`select a.id, a.status, a.answers, a.missing_info, a.written, a.form_questions, a.notes, a.submitted_at,
                       j.title, j.employer, j.location, j.country, j.category, j.match_score, j.match_reasons, j.eligibility, j.eligibility_reasons,
                       j.deadline, j.salary, j.description, j.discovered_at, s.kind as source_kind
                from applications a join jobs j on j.id = a.job_id left join sources s on s.id = j.source_id`),
    pool.query(`select application_id, category, received_at from emails where application_id is not null order by received_at`),
    skillGap(),
  ]);
  const A = apps.rows.map((a) => ({ ...a, v: verdict(a), ch: chance({ ...a, unanswered: unanswered(a).length }) }));
  const n = (f: (a: any) => boolean) => A.filter(f).length;
  const total = A.length;

  // 1. Stages
  const STAGES: [string, string[], string][] = [
    ["Being prepared", ["draft", "preparing", "failed"], "#a3a3a3"], ["To decide", ["awaiting_approval"], PALETTE.amber], ["Going ahead", ["approved"], PALETTE.teal],
    ["Submitted", ["submitting", "submitted"], PALETTE.violet], ["Online test", ["assessment"], "#60a5fa"], ["Interview", ["interview"], PALETTE.blue],
    ["Offer", ["offer"], PALETTE.green], ["Rejected", ["rejected"], PALETTE.red], ["Not doing", ["declined", "withdrawn"], "#52525b"],
  ];
  const stages = STAGES.map(([label, st, color]) => ({ label, value: n((a) => st.includes(a.status)), color })).filter((s) => s.value > 0);
  const sent = n((a) => !!a.submitted_at);

  // 2. Splits
  const by = (key: (a: any) => string) => { const m = new Map<string, number>(); for (const a of A) m.set(key(a), (m.get(key(a)) ?? 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1]); };
  const types = seg(by((a) => CATEGORY[a.category] ?? a.category ?? "Other"));
  const countries = seg(by((a) => (a.country === "UK" ? "UK" : a.country ? countryName(a.country) : "Other")));
  const recs = seg([["✅ Apply", n((a) => a.v.tone === "good")], ["👍 Worth applying", n((a) => a.v.tone === "ok")], ["🤔 Your call", n((a) => a.v.tone === "warn")], ["⚠️ Probably skip", n((a) => a.v.tone === "bad")]]);
  const chances = seg([["Good or strong (18%+)", n((a) => a.ch.pct >= 18)], ["Possible (8–17%)", n((a) => a.ch.pct >= 8 && a.ch.pct < 18)], ["Long shot (under 8%)", n((a) => a.ch.pct > 0 && a.ch.pct < 8)]]);
  const visa = seg(Object.entries(ELIG).map(([k, v]) => [v.label, n((a) => a.eligibility === k)] as [string, number]));
  const employers = seg([["Big employers (own careers sites)", n((a) => a.source_kind && !["reed", "jooble", "adzuna", "careerjet"].includes(a.source_kind))], ["Smaller firms and agencies", n((a) => ["reed", "jooble", "adzuna", "careerjet"].includes(a.source_kind))], ["Added by you", n((a) => !a.source_kind)]]);

  // 3. CV weak points: what employers ask for that your CV doesn't show
  const miss = new Map<string, number>();
  for (const a of A) for (const m of (a.missing_info ?? []) as string[]) {
    if (!m.startsWith("Requirement without evidence:")) continue;
    const r = m.replace("Requirement without evidence: ", "").trim();
    if (/not required|no (previous|prior)|related (field|discipline|subject)|(studying|enrolled|pursuing).{0,40}(degree|bachelor)/i.test(r)) continue;
    miss.set(r, (miss.get(r) ?? 0) + 1);
  }
  const topMiss = [...miss.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  const reqTotal = A.reduce((s, a) => s + ((a.answers as any[]) ?? []).length, 0);
  const reqShown = A.reduce((s, a) => s + ((a.answers as any[]) ?? []).filter((q) => q.evidence === "verified").length, 0);
  const weakMatch = n((a) => (a.match_score ?? 0) < 40);
  const answersMissing = A.filter((a) => ["awaiting_approval", "approved"].includes(a.status)).reduce((s, a) => s + unanswered(a).length, 0);

  // 4. Tests and interviews: how far you get after each stage
  const seen = new Map<string, Set<string>>();
  for (const e of emails.rows) { const s = seen.get(e.application_id) ?? new Set(); s.add(e.category); seen.set(e.application_id, s); }
  const reached = (stage: "assessment" | "interview") => A.filter((a) => a.status === stage || seen.get(a.id)?.has(stage) || (stage === "assessment" && ["interview", "offer"].includes(a.status) && seen.get(a.id)?.has("assessment")) || (stage === "interview" && a.status === "offer"));
  const tests = reached("assessment"), interviews = reached("interview");
  const outcome = (list: any[], next: string[]) => ({ passed: list.filter((a) => next.includes(a.status)).length, failed: list.filter((a) => a.status === "rejected").length, waiting: list.filter((a) => !next.includes(a.status) && a.status !== "rejected").length });
  const T = outcome(tests, ["interview", "offer"]), I = outcome(interviews, ["offer"]);
  const rejectedAtApply = n((a) => a.status === "rejected" && !seen.get(a.id)?.has("assessment") && !seen.get(a.id)?.has("interview"));
  const declined = new Map<string, number>();
  for (const a of A.filter((x) => x.status === "declined")) { try { const r = JSON.parse(a.notes ?? "{}").decision?.reasonText ?? "No reason given"; declined.set(r, (declined.get(r) ?? 0) + 1); } catch { /* old note */ } }

  const Card = ({ title, id, children }: { title: string; id: string; children: React.ReactNode }) => <section id={id} className="card p-4 space-y-3"><h2 className="font-bold">{title}</h2>{children}</section>;
  const Pie = ({ title, segs, sub }: { title: string; segs: ReturnType<typeof seg>; sub: string }) => (
    <div><p className="hud-label mb-2">{title}</p>{segs.length ? <Donut segments={segs} sub={sub} /> : <p className="text-sm text-muted">Nothing yet</p>}</div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" subtitle={`Your applications in numbers: ${total} prepared, ${sent} sent`} />

      <Card title="Where your applications are" id="stages">
        {stages.length ? <Donut segments={stages} sub="applications" size={150} /> : <p className="text-sm text-muted">No applications yet.</p>}
        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          {[["Sent", sent], ["Reached a test", tests.length], ["Reached interview", interviews.length]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}><p className="text-xl font-black tabular-nums">{v as number}</p><p className="text-[11px] text-muted">{l as string}</p></div>
          ))}
        </div>
      </Card>

      <Card title="What your applications are" id="splits">
        <div className="grid md:grid-cols-2 gap-5">
          <Pie title="By type" segs={types} sub="by type" />
          <Pie title="By country" segs={countries} sub="countries" />
          <Pie title="Recommendation" segs={recs} sub="verdicts" />
          <Pie title="Chance of getting it" segs={chances} sub="estimates" />
          <Pie title="Visa fit" segs={visa} sub="eligibility" />
          <Pie title="Who's hiring" segs={employers} sub="employers" />
        </div>
      </Card>

      <Card title="CV weak points" id="cv">
        <Progress label="Requirements your CV shows" right={reqTotal ? `${reqShown} of ${reqTotal} (${Math.round((reqShown / reqTotal) * 100)}%)` : "—"} value={reqShown} max={Math.max(reqTotal, 1)} color="var(--good)" />
        <Progress label="Applications with a weak match (under 40%)" right={`${weakMatch} of ${total}`} value={weakMatch} max={Math.max(total, 1)} color="var(--bad)" height={6} />
        {answersMissing > 0 && <p className="text-sm">✍️ <b>{answersMissing}</b> personal answer{answersMissing > 1 ? "s" : ""} still to write on applications you could send. <Link href="/todo#send" className="text-accent font-semibold">Write them →</Link></p>}
        <div>
          <p className="hud-label mb-1.5">Asked for most, not on your CV</p>
          {topMiss.length ? (
            <ul className="space-y-1.5 text-sm">{topMiss.map(([r, c]) => <li key={r} className="flex gap-2"><span className="chip !py-0.5 shrink-0 tabular-nums" style={{ color: "var(--bad)" }}>{c}×</span><span>{short(r)}</span></li>)}</ul>
          ) : <p className="text-sm text-muted">No repeated gaps found. 👍</p>}
        </div>
        <div>
          <p className="hud-label mb-1.5">Skills employers want that you haven&apos;t shown yet</p>
          <div className="flex flex-wrap gap-1.5">
            {gap.rows.filter((g) => !g.have).slice(0, 8).map((g) => <a key={g.key} href={g.learn.href} target="_blank" rel="noopener noreferrer" className="chip !py-1" style={{ color: "var(--bad)" }}>{g.label} · {g.jobs} jobs ↗</a>)}
            {!gap.rows.some((g) => !g.have) && <span className="text-sm text-muted">None of the common ones. 👍</span>}
          </div>
          <Link href="/manager#skills" className="text-xs text-accent font-semibold inline-block mt-2">Free courses for each in Manager →</Link>
        </div>
      </Card>

      <Card title="Tests and interviews" id="assessments">
        {sent === 0 ? <p className="text-sm text-muted">Nothing sent yet, so no results to analyse. Once replies come in, this shows where you drop out: at the application, the test or the interview.</p> : (
          <>
            <Progress label="Turned down straight from the application" right={`${rejectedAtApply} of ${sent}`} value={rejectedAtApply} max={sent} color="var(--bad)" />
            <Progress label="Online tests passed" right={tests.length ? `${T.passed} of ${tests.length}${T.waiting ? ` (${T.waiting} waiting)` : ""}` : "none yet"} value={T.passed} max={Math.max(tests.length, 1)} color="var(--good)" />
            <Progress label="Interviews turned into offers" right={interviews.length ? `${I.passed} of ${interviews.length}${I.waiting ? ` (${I.waiting} waiting)` : ""}` : "none yet"} value={I.passed} max={Math.max(interviews.length, 1)} color="var(--good)" />
            <p className="text-sm">
              {rejectedAtApply >= 5 && rejectedAtApply / sent > 0.6 ? "🔎 Most rejections happen at the application stage: strengthen your CV evidence and personal answers, and favour ✅ roles."
                : T.failed > T.passed && tests.length >= 2 ? "🧪 Tests are your weak point: do 2–3 free practice tests of the right type before each one (links on each application)."
                : I.failed > I.passed && interviews.length >= 2 ? "🎤 Interviews are your weak point: prepare STAR stories from your projects and practise out loud."
                : "📈 Not enough results yet to see a pattern. Keep sending; this fills in as replies arrive."}
            </p>
          </>
        )}
      </Card>

      {declined.size > 0 && (
        <Card title="Why you say no" id="declined">
          <Donut segments={seg([...declined.entries()].sort((x, y) => y[1] - x[1]))} sub="declined" />
          <p className="text-xs text-muted">If one reason dominates (e.g. location or dates), tighten your search in Settings so fewer of those are prepared.</p>
        </Card>
      )}
    </div>
  );
}
