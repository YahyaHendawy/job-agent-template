import Link from "next/link";
import { pool } from "@/db";
import { PageHeader, fmtDate, timeAgo } from "@/components/ui";
import { WeeklyCard } from "@/components/WeeklyCard";
import { inboxAddress } from "@/components/Limits";
import { loadPersona } from "@/lib/persona";
import { unanswered } from "@/lib/written";
import { readNotes } from "@/lib/goahead";
import { logOwnApplication, quickMarkSent, chaseLater, markNoReply, toggleOnceItem, markEmailHandled } from "@/app/actions";

export const dynamic = "force-dynamic";

const SITES = ["LinkedIn (Easy Apply)", "Indeed", "Gradcracker", "Bright Network", "RateMyPlacement", "The company's own website", "University careers portal", "Careers fair / in person", "A recruiter or agency", "Email", "Other"];
const q = encodeURIComponent;
const daysTo = (d: string | Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

/**
 * "Your part": every step the app can't take for you, in one ordered list, with the shortest route to finish each one.
 * Nothing here is done for you; each item says exactly what to do and gives the button for it.
 */
export default async function YourPart({ searchParams }: { searchParams: Promise<{ logged?: string; error?: string }> }) {
  const sp = await searchParams;
  const P = await loadPersona();
  const uk = P.markets.some((m) => m.code === "UK") || P.home.country === "UK";
  const kw = P.keywords[0] || "internship";
  const [going, mail, mailTotal, stages, chase, decide, own, det, once, autofill] = await Promise.all([
    pool.query(`select a.id, a.form_questions, a.written, j.application_url, j.title, j.employer, j.deadline from applications a join jobs j on j.id = a.job_id
                where a.status = 'approved' order by j.deadline asc nulls last, a.approved_at asc`),
    pool.query(`select e.id, e.category, e.subject, e.from_name, e.received_at, j.employer from emails e left join applications a on a.id = e.application_id left join jobs j on j.id = a.job_id
                where e.needs_action and e.handled_at is null order by e.received_at desc limit 8`),
    pool.query(`select count(*)::int n from emails where needs_action and handled_at is null`),
    pool.query(`select a.id, a.status, a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.status in ('assessment','interview','offer') order by a.updated_at desc`),
    pool.query(`select a.id, a.notes, a.submitted_at, a.submission_evidence, j.title, j.employer from applications a join jobs j on j.id = a.job_id
                where a.status = 'submitted' and a.submitted_at < now() - interval '14 days'
                  and not exists (select 1 from emails e where e.application_id = a.id and e.received_at > a.submitted_at and e.category <> 'received')
                order by a.submitted_at asc`),
    pool.query(`select a.id, j.employer, count(*) over()::int n, count(*) filter (where j.deadline between now() and now() + interval '3 days') over()::int soon
                from applications a join jobs j on j.id = a.job_id where a.status = 'awaiting_approval'
                order by (j.deadline is not null and j.deadline > now()) desc, j.deadline asc nulls last, j.match_score desc limit 1`),
    pool.query(`select a.id, a.status, a.submitted_at, j.title, j.employer from applications a join jobs j on j.id = a.job_id where j.fingerprint like 'own:%' order by a.created_at desc limit 5`),
    pool.query(`select value from settings where key = 'applicationDetails'`),
    pool.query(`select value from settings where key = 'onceChecklist'`),
    pool.query(`select count(*)::int n from api_tokens where revoked_at is null`),
  ]);
  const inbox = await inboxAddress();
  const d = det.rows[0]?.value ?? {};
  const doneOnce: string[] = once.rows[0]?.value?.done ?? [];
  const chaseNow = chase.rows.filter((a) => { const n = readNotes(a.notes); return !n.chaseAfter || Date.parse(n.chaseAfter) < Date.now(); });
  const dec = decide.rows[0];

  // One-off set-up: accounts and alerts only you can create. Auto-ticked where the app can tell.
  const ONCE: { id: string; title: string; why: string; links: { label: string; href: string }[]; auto?: boolean }[] = [
    { id: "inbox", auto: !!inbox, title: inbox ? `Use ${inbox} for every job account` : "Connect your job inbox", why: "Employers' replies only reach me if they go to this address. Use it when you sign up anywhere below.", links: inbox ? [] : [{ label: "Connect", href: "/settings/email" }] },
    { id: "autofill", auto: autofill.rows[0].n > 0, title: "Safari autofill on your Mac", why: "Fills employer forms for you; you only check and press Submit.", links: [{ label: "Set up", href: "/settings/autofill" }] },
    { id: "details", auto: !!(d.postcode && (d.addressLine1 || d.addressChoice === "area-only")), title: "Application details complete", why: "Address, visa expiry and dates go into every form and Apply Kit.", links: [{ label: "Check", href: "/settings/details" }] },
    { id: "linkedin", title: "LinkedIn profile up to date + “Open to work” (recruiters only)", why: "Recruiters search LinkedIn. Headline, photo, your projects and skills from your CV.", links: [{ label: "Edit profile", href: "https://www.linkedin.com/in/me/" }, { label: "Open to work", href: "https://www.linkedin.com/in/me/opportunities/job-opportunities/details/" }] },
    { id: "li-alert", title: `LinkedIn job alert for “${kw}”, sent to your job inbox`, why: "New roles reach you daily; good ones you add with “+ Add by link”.", links: [{ label: "Create alert", href: `https://www.linkedin.com/jobs/search/?keywords=${q(kw)}&location=${q(P.home.city || "United Kingdom")}` }] },
    { id: "indeed", title: "Indeed account + job alert", why: "Indeed blocks automatic reading, so its own email alerts are the only way to hear about its jobs.", links: [{ label: "Indeed alerts", href: `https://uk.indeed.com/jobs?q=${q(kw)}&l=${q(P.home.city || "")}` }] },
    ...(uk ? [
      { id: "gradcracker", title: "Gradcracker account + alerts (engineering & tech)", why: "The biggest UK board for engineering placements and internships.", links: [{ label: "Gradcracker", href: "https://www.gradcracker.com/" }] },
      { id: "bright", title: "Bright Network account", why: "Internships, insight days and free virtual experience programmes.", links: [{ label: "Bright Network", href: "https://www.brightnetwork.co.uk/" }] },
      { id: "rmp", title: "RateMyPlacement alerts", why: "Placement-year and summer internship listings with student reviews.", links: [{ label: "RateMyPlacement", href: "https://www.ratemyplacement.co.uk/" }] },
    ] : []),
    ...(P.university ? [{ id: "uni", title: `${P.universityShort || P.university} careers portal account`, why: "Local and university-only vacancies, CV checks and mock interviews, all free.", links: [{ label: "Find it", href: `https://www.google.com/search?q=${q(`${P.university} careers portal student jobs`)}` }] }] : []),
  ];
  const onceLeft = ONCE.filter((o) => !(o.auto ?? doneOnce.includes(o.id))).length;

  const sections = [
    { id: "send", icon: "📨", label: "Send", n: going.rowCount ?? 0 },
    { id: "emails", icon: "📧", label: "Reply", n: mailTotal.rows[0].n },
    { id: "stages", icon: "🎤", label: "Tests & interviews", n: stages.rowCount ?? 0 },
    { id: "chase", icon: "⏳", label: "Follow up", n: chaseNow.length },
    { id: "decide", icon: "🤔", label: "Decide", n: dec?.n ?? 0 },
    { id: "setup", icon: "🧰", label: "Set up once", n: onceLeft },
  ];
  const left = sections.reduce((n, s) => n + s.n, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Your part" subtitle="Everything only you can do, in one place. Work top to bottom and nothing gets missed." right={<Link href="/limits" className="btn btn-ghost !text-sm">Why?</Link>} />

      <section className="card p-4 gradient-hero">
        <p className="hud-label">Outstanding</p>
        <p className="text-3xl font-black tabular-nums mt-1">{left} <span className="text-base font-semibold text-muted">{left === 1 ? "thing needs you" : "things need you"}</span></p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="chip !py-1" style={s.n ? { color: "var(--ink)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" } : { opacity: .55 }}>
              {s.icon} {s.label} <b className="tabular-nums ml-1">{s.n}</b>
            </a>
          ))}
        </div>
      </section>

      {/* 1. Send */}
      <Block id="send" icon="📨" title="Send these applications" n={going.rowCount ?? 0}
        hint="You said yes. I can't press Submit or sign in to employer sites, so this is the last step. On your Mac, Apply now opens the form and autofill fills it."
        empty="Nothing waiting to be sent.">
        {going.rows.map((a) => {
          const qs = unanswered(a);
          const dl = daysTo(a.deadline);
          const url: string | null = a.application_url;
          return (
            <li key={a.id} className="py-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/applications/${a.id}`} className="font-semibold leading-snug">{a.title}</Link>
                  <p className="text-xs text-muted">{a.employer}{a.deadline ? ` · closes ${fmtDate(a.deadline)}` : " · no deadline given"}</p>
                </div>
                {dl != null && dl <= 3 && <span className="chip shrink-0" style={{ color: "var(--bad)" }}>{dl < 0 ? "Passed" : dl === 0 ? "Today" : `${dl}d left`}</span>}
              </div>
              <ol className="text-xs space-y-1">
                <Tick done={!qs.length}>{qs.length ? <Link href={`/applications/${a.id}#answers`} className="underline">Write {qs.length} answer{qs.length > 1 ? "s" : ""} in your own words</Link> : "Your answers are written"}</Tick>
                <Tick done={false}>{url ? <a href={`${url.split("#")[0]}#jobagent=${a.id}`} target="_blank" rel="noopener noreferrer" className="underline">Open the form ↗</a> : <Link href={`/applications/${a.id}#next-steps`} className="underline">Find the form</Link>}, check every field, press Submit</Tick>
                <Tick done={false}>Tap “I've sent it” (the confirmation email also marks it by itself)</Tick>
              </ol>
              <div className="flex flex-wrap gap-2">
                {url && <a href={`${url.split("#")[0]}#jobagent=${a.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary !py-1.5 !text-xs">Apply now ↗</a>}
                <Link href={`/applications/${a.id}#next-steps`} className="btn btn-ghost !py-1.5 !text-xs">Apply Kit</Link>
                <form action={quickMarkSent.bind(null, a.id)}><button className="btn btn-ghost !py-1.5 !text-xs">✓ I&apos;ve sent it</button></form>
              </div>
            </li>
          );
        })}
      </Block>

      {/* 2. Emails */}
      <Block id="emails" icon="📧" title="Emails waiting for you" n={mailTotal.rows[0].n}
        hint="I never send an email myself. Replies, booking links and email confirmations are yours: open each one, act on it, then tick it."
        empty="No emails need you." more={mailTotal.rows[0].n > mail.rowCount! ? { href: "/emails?status=todo", label: `All ${mailTotal.rows[0].n}` } : undefined}>
        {mail.rows.map((e) => (
          <li key={e.id} className="py-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Link href={`/emails/${e.id}`} className="font-semibold text-sm block truncate">{e.subject || "(no subject)"}</Link>
              <p className="text-xs text-muted truncate">{e.employer ?? e.from_name} · {timeAgo(e.received_at)}</p>
            </div>
            <Link href={`/emails/${e.id}`} className="btn btn-primary !py-1.5 !text-xs">Open</Link>
            <form action={markEmailHandled.bind(null, e.id)}><button className="btn btn-ghost !py-1.5 !text-xs" title="Done">✓</button></form>
          </li>
        ))}
      </Block>

      {/* 3. Tests, interviews, offers */}
      <Block id="stages" icon="🎤" title="Tests, interviews and offers" n={stages.rowCount ?? 0}
        hint="These are all you. Each one opens a step-by-step prep guide with free practice links. Save interview times so you get reminders."
        empty="None right now.">
        {stages.rows.map((a) => {
          const n = readNotes(a.notes);
          const what = a.status === "assessment" ? "📝 Online test: do it a day early" : a.status === "offer" ? "🎉 Offer: check dates against your visa before saying yes" : n.interviewAt ? `🎤 Interview ${new Date(n.interviewAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "🎤 Interview: save the date and time";
          return (
            <li key={a.id} className="py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{a.employer}: {a.title}</p><p className="text-xs text-muted">{what}</p></div>
              <Link href={`/applications/${a.id}`} className="btn btn-primary !py-1.5 !text-xs">Prep</Link>
            </li>
          );
        })}
      </Block>

      {/* 4. Follow up */}
      <Block id="chase" icon="⏳" title="No reply after 2 weeks" n={chaseNow.length}
        hint="Silence is normal. If there's a contact, a short polite check-in can help. Otherwise wait, or close it so your list stays honest."
        empty="Nothing to chase.">
        {chaseNow.map((a) => (
          <li key={a.id} className="py-2.5 space-y-1.5">
            <p className="font-semibold text-sm">{a.employer}: {a.title}</p>
            <p className="text-xs text-muted">Sent {fmtDate(a.submitted_at)} · {Math.floor((Date.now() - new Date(a.submitted_at).getTime()) / 86400000)} days, no reply</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/applications/${a.id}`} className="btn btn-ghost !py-1.5 !text-xs">Open</Link>
              <form action={chaseLater.bind(null, a.id)}><button className="btn btn-ghost !py-1.5 !text-xs">Wait 2 more weeks</button></form>
              <form action={markNoReply.bind(null, a.id)}><button className="btn btn-ghost !py-1.5 !text-xs">No reply: close it</button></form>
            </div>
          </li>
        ))}
      </Block>

      {/* 5. Decide */}
      <section id="decide" className="card p-4 scroll-mt-4">
        <Head icon="🤔" title="Applications to decide" n={dec?.n ?? 0} />
        {dec ? (
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm flex-1">{dec.n} prepared and waiting for yes or no{dec.soon ? <>, <b style={{ color: "var(--bad)" }}>{dec.soon} closing within 3 days</b></> : null}. Each takes about a minute; the next opens by itself.</p>
            <Link href={`/applications/${dec.id}`} className="btn btn-primary !text-sm shrink-0">Start</Link>
          </div>
        ) : <p className="text-sm text-muted mt-2">✓ All decided.</p>}
      </section>

      {/* 6. Job sites */}
      <div id="sites" className="scroll-mt-4">
        <p className="hud-label mb-2 px-1">🌐 Sites I can't search: your weekly check</p>
        <WeeklyCard />
      </div>

      {/* 7. Log your own applications */}
      <section id="own" className="card p-4 scroll-mt-4 space-y-3">
        <Head icon="➕" title="Applied somewhere else? Log it" />
        <p className="text-sm text-muted">Applied on LinkedIn, Indeed, at a fair or straight on a company site? Log it in 20 seconds. I then link their emails to it, show it in Applications, prep you for tests and interviews, and remind you to follow up.</p>
        {sp.logged && <p className="text-sm" style={{ color: "var(--good)" }}>✓ Logged. It's in Applications → Submitted.</p>}
        {sp.error === "own" && <p className="text-sm" style={{ color: "var(--bad)" }}>Add at least the employer and the job title.</p>}
        <form action={logOwnApplication} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="employer" required placeholder="Employer *" className="input" />
          <input name="title" required placeholder="Job title *" className="input" />
          <select name="site" className="input" defaultValue={SITES[0]} aria-label="Where you applied">{SITES.map((s) => <option key={s}>{s}</option>)}</select>
          <input name="when" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" aria-label="Date applied" />
          <input name="url" type="url" placeholder="Link to the advert (optional)" className="input sm:col-span-2" />
          <button className="btn btn-primary sm:col-span-2">Log this application</button>
        </form>
        <p className="text-xs text-muted">Not applied yet? Use <Link href="/jobs/new" className="underline">+ Add by link</Link> instead and I'll prepare a tailored CV first.</p>
        {own.rowCount! > 0 && (
          <ul className="text-sm divide-y divide-line">
            {own.rows.map((a) => <li key={a.id} className="py-1.5 flex gap-2"><Link href={`/applications/${a.id}`} className="flex-1 truncate">{a.employer}: {a.title}</Link><span className="text-xs text-muted">{a.submitted_at ? fmtDate(a.submitted_at) : ""}</span></li>)}
          </ul>
        )}
      </section>

      {/* 8. One-off set-up */}
      <section id="setup" className="card p-4 scroll-mt-4">
        <Head icon="🧰" title="Set up once" n={onceLeft} />
        <p className="text-sm text-muted mt-1 mb-2">I can't create accounts or sign in for you. Do these once (about 10 minutes each) and the sites start sending jobs to you.</p>
        <ul className="divide-y divide-line">
          {ONCE.map((o) => {
            const done = o.auto ?? doneOnce.includes(o.id);
            return (
              <li key={o.id} className="py-2.5 flex gap-3 items-start">
                {o.auto === undefined ? (
                  <form action={toggleOnceItem.bind(null, o.id)}>
                    <button aria-label={done ? "Mark not done" : "Mark done"} className="w-6 h-6 rounded-md border grid place-items-center mt-0.5 shrink-0"
                      style={{ borderColor: done ? "var(--good)" : "var(--line)", background: done ? "var(--good)" : "transparent", color: "#fff" }}>{done ? "✓" : ""}</button>
                  </form>
                ) : <span className="w-6 h-6 rounded-md grid place-items-center mt-0.5 shrink-0 text-xs" style={{ background: done ? "var(--good)" : "var(--surface-2)", color: "#fff" }} title="Checked automatically">{done ? "✓" : "!"}</span>}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm ${done ? "line-through text-muted" : ""}`}>{o.title}</p>
                  {!done && <p className="text-xs text-muted">{o.why}</p>}
                  {!done && o.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {o.links.map((l) => l.href.startsWith("/")
                        ? <Link key={l.href} href={l.href} className="chip !text-accent">{l.label} →</Link>
                        : <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="chip !text-accent">{l.label} ↗</a>)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-muted text-center">Everything else (finding jobs, eligibility, tailored CVs, watching your inbox, reminders) runs by itself. <Link href="/limits" className="underline">What I can't do</Link></p>
    </div>
  );
}

function Head({ icon, title, n }: { icon: string; title: string; n?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <h2 className="font-bold flex-1">{title}</h2>
      {typeof n === "number" && <span className="chip tabular-nums" style={n ? { color: "var(--accent)" } : { color: "var(--good)" }}>{n ? n : "✓"}</span>}
    </div>
  );
}

function Block({ id, icon, title, n, hint, empty, more, children }: { id: string; icon: string; title: string; n: number; hint: string; empty: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} className="card p-4 scroll-mt-4">
      <Head icon={icon} title={title} n={n} />
      <p className="text-xs text-muted mt-1">{hint}</p>
      {n ? <ul className="divide-y divide-line mt-1">{children}</ul> : <p className="text-sm mt-2" style={{ color: "var(--good)" }}>✓ {empty}</p>}
      {more && <Link href={more.href} className="text-sm text-accent font-semibold inline-block mt-2">{more.label} →</Link>}
    </section>
  );
}

function Tick({ done, children }: { done: boolean; children: React.ReactNode }) {
  return <li className="flex gap-1.5"><span style={{ color: done ? "var(--good)" : "var(--muted)" }}>{done ? "✓" : "○"}</span><span className={done ? "text-muted" : ""}>{children}</span></li>;
}
