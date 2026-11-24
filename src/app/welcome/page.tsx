import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDraft } from "@/lib/onboarding";
import { FIELDS, COUNTRIES, loadPersona } from "@/lib/persona";
import { saveCv, saveFacts, saveStudy, savePlace, saveJobs, saveDetailsStep, saveFilters, saveNotify } from "./actions";

export const dynamic = "force-dynamic";

const STEPS = ["Start", "Your CV", "Check your CV facts", "Your studies", "Right to work & places", "Jobs you want", "Application questions", "Optional filters", "Notifications"];
const ERR: Record<string, string> = {
  empty: "Couldn't read enough text. Paste your CV text into the box instead (open your CV, Select All, Copy, Paste).",
  pdf: "This PDF can't be read as text (common with designed PDFs). Open it, Select All, Copy, and paste the text into the box below. Or upload the Word (.docx) version.",
  big: "That file is over 4 MB. Upload a smaller copy or paste the text.",
};

function Shell({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh p-4 safe-top max-w-lg mx-auto pb-16">
      <p className="text-xs font-semibold text-muted mt-2">STEP {step} OF {STEPS.length - 1} · {STEPS[step].toUpperCase()}</p>
      <div className="h-2 rounded-full bg-[var(--surface-2)] my-2"><div className="h-2 rounded-full" style={{ width: `${(step / (STEPS.length - 1)) * 100}%`, background: "var(--accent)" }} /></div>
      <div className="space-y-4 mt-4">{children}</div>
      {step > 1 && <Link href={`/welcome?step=${step - 1}`} className="block text-center text-sm text-muted mt-6 underline">← Back</Link>}
    </main>
  );
}
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block"><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}<div className="mt-1">{children}</div></label>
);
const Next = ({ text = "Save and continue →" }: { text?: string }) => <button className="btn btn-primary w-full !py-3 !text-base">{text}</button>;
const Check = ({ name, label, on, hint }: { name: string; label: string; on?: boolean; hint?: string }) => (
  <label className="flex items-start gap-3 card p-3"><input type="checkbox" name={name} defaultChecked={on} className="mt-1 size-5 shrink-0" /><span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span></label>
);
const Select = ({ name, value, options }: { name: string; value?: string; options: [string, string][] }) => (
  <select name={name} defaultValue={value} className="input">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
);

export default async function Welcome({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const P = await loadPersona(true);
  const step = Math.max(0, Math.min(8, Number(sp.step ?? 0) || 0));
  const d = await getDraft();
  // A set-up that wasn't made with this wizard (e.g. written by hand) is never overwritten from here.
  if (P.completed && (!sp.step || !d.study)) redirect("/welcome/connect");
  const year = new Date().getFullYear();

  if (step === 0) return (
    <Shell step={0}>
      <h1 className="text-2xl font-bold">Let&apos;s make this app yours 👋</h1>
      <p>About 15 minutes, all on your phone. You&apos;ll answer a few questions so the agent knows what to look for, then link a few free services one at a time.</p>
      <ul className="card p-4 space-y-2 text-sm">
        <li>📄 Your CV: the app reads it, and you tick only what&apos;s true. Nothing is made up.</li>
        <li>🎓 Your studies, visa or right to work, and the countries and cities you want.</li>
        <li>💼 The jobs you want and the standard questions forms ask.</li>
        <li>🔗 Then: free job-site keys, your job inbox, and notifications on your phone.</li>
      </ul>
      <p className="text-sm text-muted">Everything is stored only in your own free database. Nobody else, including whoever shared this app, can see it.</p>
      <Link href="/welcome?step=1" className="btn btn-primary w-full !py-3 !text-base">Start →</Link>
    </Shell>
  );

  if (step === 1) return (
    <Shell step={1}>
      <h1 className="text-xl font-bold">Add your CV</h1>
      {sp.error && <p className="card p-3 text-sm" style={{ color: "var(--warn)" }}>{ERR[sp.error] ?? "Something went wrong. Try again."}</p>}
      <form action={saveCv} className="space-y-4">
        <Field label="Upload your CV" hint="Word (.docx) works best. PDF works if it's a simple text PDF. On iPhone, tap below, then Browse to pick it from Files, iCloud Drive or Google Drive.">
          <input type="file" name="file" accept=".docx,.pdf,.txt" className="input" />
        </Field>
        <p className="text-center text-sm text-muted">or</p>
        <Field label="Paste your CV text" hint="Open your CV, tap and hold → Select All → Copy, then paste here.">
          <textarea name="pasted" rows={6} className="input" defaultValue={d.cvText && !d.cvFilename?.endsWith(".docx") ? d.cvText : ""} />
        </Field>
        <Next text="Read my CV →" />
      </form>
      {d.suggestions && <Link href="/welcome?step=2" className="block text-center text-sm underline">Skip: keep the CV I already added</Link>}
    </Shell>
  );

  if (step === 2) {
    if (!d.suggestions) redirect("/welcome?step=1");
    const f = d.facts ?? {};
    const KIND: Record<string, string> = { education: "🎓", experience: "💼", projects: "🛠️", skills: "🧰", leadership: "⭐", other: "📝" };
    return (
      <Shell step={2}>
        <h1 className="text-xl font-bold">Check what we found</h1>
        <p className="text-sm">Fix anything wrong and <b>untick any line that isn&apos;t true or that you don&apos;t want on applications</b>. Only ticked lines are used. Nothing is added that isn&apos;t in your CV.</p>
        <form action={saveFacts} className="space-y-4">
          <div className="card p-4 space-y-3">
            <Field label="Full name"><input name="name" defaultValue={f.name} className="input" required /></Field>
            <Field label="Email for job applications" hint="Tip: a new free Gmail just for jobs keeps things tidy (you'll connect it later)."><input name="email" type="email" defaultValue={f.email} className="input" required /></Field>
            <Field label="Phone"><input name="phone" type="tel" defaultValue={f.phone} className="input" /></Field>
            <Field label="LinkedIn (optional)"><input name="linkedin" defaultValue={f.linkedin} className="input" /></Field>
            <Field label="GitHub / portfolio (optional)"><input name="github" defaultValue={f.github} className="input" /></Field>
            <Field label="Nationality" hint="Forms ask for it. Used only to answer them."><input name="nationality" defaultValue={f.nationality} className="input" /></Field>
            <Field label="Languages you speak" hint="Comma-separated, e.g. English (fluent), Arabic (native)"><input name="languages" defaultValue={(f.languages ?? []).join(", ")} className="input" /></Field>
          </div>
          {d.suggestions.sections.filter((s) => s.kind !== "skills" && s.kind !== "other").map((sec) => {
            const i = d.suggestions!.sections.indexOf(sec);
            return (
              <section key={i} className="space-y-2">
                <h2 className="font-bold">{KIND[sec.kind]} {sec.heading}</h2>
                {sec.lines.map((l, j) => <Check key={j} name={`l-${i}-${j}`} label={l} on />)}
              </section>
            );
          })}
          <section className="space-y-2">
            <h2 className="font-bold">🧰 Skills found in your CV</h2>
            {(f.skills ?? []).length ? (f.skills ?? []).map((k) => <Check key={k} name={`sk-${k}`} label={k} on />) : <p className="text-sm text-muted">None recognised. Add yours below.</p>}
            <Field label="Other skills you really have" hint="Comma-separated. Only add what you could talk about in an interview."><input name="moreSkills" className="input" /></Field>
          </section>
          <Next />
        </form>
      </Shell>
    );
  }

  if (step === 3) {
    const s = d.study ?? {};
    return (
      <Shell step={3}>
        <h1 className="text-xl font-bold">Your studies</h1>
        <form action={saveStudy} className="space-y-4">
          <Field label="University or college"><input name="university" defaultValue={s.university} className="input" required placeholder="e.g. University of Manchester" /></Field>
          <Field label="Short name" hint="How you'd say it in a sentence, e.g. Manchester, UCL"><input name="universityShort" defaultValue={s.universityShort} className="input" /></Field>
          <Field label="Degree (as on your CV)"><input name="degree" defaultValue={s.degree} className="input" placeholder="e.g. BSc (Hons) Computer Science" /></Field>
          <Field label="Closest field" hint="Decides which jobs count as a good fit. You can add your own keywords later.">
            <Select name="field" value={s.field ?? "general"} options={Object.entries(FIELDS).map(([k, v]) => [k, v.label])} />
          </Field>
          <Field label="Year of study" hint="e.g. 2nd year (2026/27)"><input name="yearOfStudy" defaultValue={s.yearOfStudy} className="input" /></Field>
          <Field label="Expected graduation year"><input name="gradYear" type="number" inputMode="numeric" min={year - 1} max={year + 8} defaultValue={s.gradYear ?? year + 2} className="input" required /></Field>
          <Field label="Graduation year if you take a placement year (optional)" hint="Leave empty if your course has no placement year."><input name="placementGradYear" type="number" inputMode="numeric" defaultValue={s.placementGradYear ?? ""} className="input" /></Field>
          <Field label="Which summer are you looking for work?"><input name="summerYear" type="number" inputMode="numeric" defaultValue={s.summerYear ?? (new Date().getMonth() >= 8 ? year + 1 : year)} className="input" /></Field>
          <Field label="Your summer break, roughly" hint="e.g. about mid-June to mid-September"><input name="summerWindow" defaultValue={s.summerWindow} className="input" /></Field>
          <Next />
        </form>
      </Shell>
    );
  }

  if (step === 4) {
    const p = d.place ?? {};
    const sel = new Map((p.markets ?? []).map((m) => [m.code, m.rightToWork]));
    const RTW: [string, string][] = [["citizen", "I'm a citizen"], ["full", "I have full right to work (settled, permanent)"], ["resident", "I live there on a residence/family permit"], ["visa", "On a visa with limits"], ["unsure", "Not sure / would need sponsorship"]];
    return (
      <Shell step={4}>
        <h1 className="text-xl font-bold">Right to work & where you want to work</h1>
        <form action={savePlace} className="space-y-4">
          <Field label="Country where you study or live now"><Select name="home" value={p.home ?? "UK"} options={Object.entries(COUNTRIES).map(([c, v]) => [c, `${v.flag} ${v.name}`])} /></Field>
          <Field label="Your city" hint="Part-time jobs near here score higher"><input name="city" defaultValue={p.city} className="input" placeholder="e.g. Manchester" /></Field>
          <Field label="Your right to work there">
            <Select name="visa" value={p.visa === "uk_student" ? "uk_student" : sel.get(p.home ?? "UK") ?? "citizen"} options={[["uk_student", "UK Student visa (the app applies the 20-hour and vacation rules)"], ...RTW.filter(([v]) => v !== "visa")]} />
          </Field>
          <Field label="Visa end date (only if you're on a visa)" hint="e.g. October 2028, from your eVisa"><input name="visaExpiry" defaultValue={p.visaExpiry} className="input" /></Field>
          <Field label="Most hours you may work a week in term time" hint="UK Student visa (degree level): 20"><input name="termHours" type="number" inputMode="numeric" defaultValue={p.termHours ?? 20} className="input" /></Field>
          <section className="space-y-2">
            <h2 className="font-bold">Other countries to search (optional)</h2>
            <p className="text-xs text-muted">Tick each one you&apos;d work in, then choose your right to work there. Be honest: the app uses this to warn you before you apply.</p>
            {Object.entries(COUNTRIES).filter(([c]) => c !== (p.home ?? "UK")).map(([c, v]) => (
              <div key={c} className="card p-3 space-y-2">
                <label className="flex items-center gap-3"><input type="checkbox" name={`m-${c}`} defaultChecked={sel.has(c)} className="size-5" /><span className="font-medium">{v.flag} {v.name}</span></label>
                <Select name={`r-${c}`} value={sel.get(c) ?? "unsure"} options={RTW.filter(([x]) => x !== "visa")} />
              </div>
            ))}
          </section>
          <Check name="remoteOk" label="Include remote jobs" on={p.remoteOk ?? true} />
          <Field label="If a form asks “Willing to relocate?”, answer" hint="e.g. Yes, within the UK"><input name="relocate" defaultValue={p.relocate} className="input" /></Field>
          <Next />
        </form>
      </Shell>
    );
  }

  if (step === 5) {
    const j = d.jobs ?? {};
    const field = FIELDS[d.study?.field ?? "general"] ?? FIELDS.general;
    const T: [string, string][] = [["summer_internship", "Summer internships"], ["placement", "Placement / year in industry"], ["part_time", "Part-time jobs during term"], ["temporary", "Temporary & holiday work"], ["research", "Research internships"], ["insight_programme", "Insight days / spring weeks"], ["graduate", "Graduate jobs"]];
    return (
      <Shell step={5}>
        <h1 className="text-xl font-bold">Jobs you want</h1>
        <form action={saveJobs} className="space-y-3">
          {T.map(([k, l]) => <Check key={k} name={`t-${k}`} label={l} on={j.types ? j.types.includes(k) : k !== "graduate"} />)}
          <Field label="Search words" hint="Comma-separated. Each becomes a saved search in every country you chose (up to 8).">
            <textarea name="keywords" rows={3} className="input" defaultValue={(j.keywords ?? field.keywords).join(", ")} />
          </Field>
          <Next />
        </form>
      </Shell>
    );
  }

  if (step === 6) {
    const x = d.details ?? {};
    return (
      <Shell step={6}>
        <h1 className="text-xl font-bold">Questions every form asks</h1>
        <p className="text-sm text-muted">Answer once; the app reuses them. Leave anything blank to decide each time.</p>
        <form action={saveDetailsStep} className="space-y-4">
          <Field label="Will you need visa sponsorship “now or in the future”?" hint="If you're on a Student visa, “Yes” is usually the truthful answer (you'd need it for a permanent job later)."><Select name="futureSponsorship" value={x.futureSponsorship ?? ""} options={[["", "Ask me each time"], ["yes", "Yes"], ["no", "No"]]} /></Field>
          <Field label="Do you hold a full driving licence?"><Select name="drivingLicence" value={x.drivingLicence ?? ""} options={[["", "Ask me"], ["yes", "Yes"], ["no", "No"]]} /></Field>
          <Field label="Any unspent criminal convictions?" hint="If yes, the app always leaves this question for you."><Select name="unspentConvictions" value={x.unspentConvictions ?? ""} options={[["", "Ask me"], ["no", "No"], ["yes", "Yes"]]} /></Field>
          <Field label="Your address on forms"><Select name="addressChoice" value={x.addressChoice ?? "full"} options={[["full", "Fill my full address"], ["area-only", "Area only: I'll type my street myself"]]} /></Field>
          <Field label="Address line 1 (optional)"><input name="addressLine1" defaultValue={x.addressLine1} className="input" autoComplete="address-line1" /></Field>
          <Field label="Postcode (optional)"><input name="postcode" defaultValue={x.postcode} className="input" autoComplete="postal-code" /></Field>
          <Field label="Earliest start date in the summer"><input name="earliestStartSummer" type="date" defaultValue={x.earliestStartSummer} className="input" /></Field>
          <Field label="Latest end date in the summer"><input name="latestEndSummer" type="date" defaultValue={x.latestEndSummer} className="input" /></Field>
          <Field label="Hours you can work in term time" hint="e.g. Up to 15 hours a week, evenings and weekends"><input name="termTimeHours" defaultValue={x.termTimeHours} className="input" /></Field>
          <Field label="Current average / predicted grade (optional)"><input name="currentAverage" defaultValue={x.currentAverage} className="input" /></Field>
          <Next />
        </form>
      </Shell>
    );
  }

  if (step === 7) {
    const fl = d.filters ?? {};
    return (
      <Shell step={7}>
        <h1 className="text-xl font-bold">Optional filters</h1>
        <p className="text-sm text-muted">Both are off unless you switch them on. You can change them any time in Settings.</p>
        <form action={saveFilters} className="space-y-3">
          <Check name="halal" label="☪️ Halal filter" on={fl.halal} hint="Never shows jobs in alcohol, gambling, pork, interest-based banking, conventional insurance, tobacco or adult entertainment. Islamic banks and takaful are allowed. Grey areas get a warning so you decide." />
          <Check name="blocklist" label="🚫 Employer block list" on={fl.blocklist} hint="Never shows employers on a list you control. Starts with Israeli companies, IDF suppliers and US defence companies; add or remove names in Settings." />
          <Next />
        </form>
      </Shell>
    );
  }

  const nt = d.notify ?? {};
  return (
    <Shell step={8}>
      <h1 className="text-xl font-bold">Notifications & weekly goal</h1>
      <form action={saveNotify} className="space-y-4">
        <Field label="When should your phone buzz?">
          <Select name="mode" value={nt.mode ?? "action"} options={[["action", "Only when I need to do something (recommended)"], ["important", "Important updates too"], ["all", "Everything"], ["quiet", "Urgent only"]]} />
        </Field>
        <Field label="Applications per week goal"><input name="goal" type="number" inputMode="numeric" min={1} max={50} defaultValue={nt.goal ?? 5} className="input" /></Field>
        <Next text="Finish and start searching 🚀" />
      </form>
    </Shell>
  );
}
