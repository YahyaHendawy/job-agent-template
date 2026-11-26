import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/db";
import { getDetails } from "@/lib/details";
import { loadPersona, persona, isUkStudent } from "@/lib/persona";
import { APP_STATUS } from "@/components/ui";
import { LimitsNote } from "@/components/Limits";
import { CopyBox } from "@/components/CopyBox";
import {
  oppOf, STATE_LABEL, STATE_ORDER, checks, prepItems, finishItems, ensureLog, inVacation, hourlyRate, daysUntil, fmtDay, mondayOf,
} from "@/lib/opportunity";
import { saveOpportunity, setOppState, toggleOppItem, logWork, deleteWorkLog, setApplicationStatus } from "@/app/actions";

export const dynamic = "force-dynamic";

const TONE = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" } as const;

/** One opportunity, start to finish. */
export default async function WorkItem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await loadPersona();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = (await pool.query(`select a.id, a.status, a.notes, j.id as job_id, j.title, j.employer, j.location, j.country, j.category, j.salary, j.start_date, j.duration, j.employment_type
     from applications a join jobs j on j.id = a.job_id where a.id = $1`, [id])).rows[0];
  if (!a) notFound();
  await ensureLog();
  const o = oppOf(a.notes);
  const det = (await getDetails()) as Record<string, any>;
  const P = persona();
  const [logs, offerMail, others, otherOpps, weekRows] = await Promise.all([
    pool.query(`select id, kind, day::text, hours, text from opportunity_log where application_id = $1 order by day desc, id desc limit 200`, [id]),
    pool.query(`select id from emails where application_id = $1 and category = 'offer' order by received_at desc limit 1`, [id]),
    pool.query(`select a.id, a.status, a.notes, j.id as job_id, j.title, j.employer from applications a join jobs j on j.id = a.job_id
                where a.id <> $1 and a.status in ('submitted','assessment','interview','offer') order by a.updated_at desc`, [id]),
    pool.query(`select notes from applications where id <> $1 and (status = 'offer' or notes like '%"opportunity"%')`, [id]),
    pool.query(`select day::text, sum(hours)::float total from opportunity_log where kind = 'hours' group by day`),
  ]);
  // The term-time limit covers all your jobs together
  // Only jobs that overlap this one, and aren't entirely in your summer break, count toward the term-time limit
  const overlapping = otherOpps.rows.map((x) => oppOf(x.notes)).filter((x) => ["accepted", "started"].includes(x.state)
    && (!x.end || !o.start || x.end >= o.start) && (!x.start || !o.end || x.start <= o.end)
    && !(x.start && x.end && det.earliestStartSummer && det.latestEndSummer && x.start >= det.earliestStartSummer && x.end <= det.latestEndSummer));
  const otherHours = overlapping.reduce((s, x) => s + (x.hours ?? 0), 0);
  const otherMissing = overlapping.some((x) => x.hours == null);
  // Your other real jobs aren't "applications to withdraw"
  const otherApps = others.rows.filter((x) => !["accepted", "started", "finished"].includes(oppOf(x.notes).state));
  const weekTotals = new Map<string, number>(weekRows.rows.map((w) => [w.day, Number(w.total)]));
  const hours = logs.rows.filter((l) => l.kind === "hours");
  const journal = logs.rows.filter((l) => l.kind === "journal");
  const mail = offerMail.rows[0]?.id as string | undefined;
  const otherOffers = otherApps.filter((x) => x.status === "offer");
  const done = o.checklist ?? [];
  const prep = prepItems(id, a, o).filter((i) => i.id !== "others" || otherApps.length > 0);
  const prepLeft = prep.filter((i) => !done.includes(i.id)).length;
  const rate = hourlyRate(o.pay ?? a.salary);
  const totalH = hours.reduce((s, h) => s + Number(h.hours), 0);
  const H = P.visa.termHours;
  const me = [det.firstName, det.lastName].filter(Boolean).join(" ");
  const step = STATE_ORDER.indexOf(o.state);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: P.timeZone || "Europe/London" }); // London date, not the server's
  const cvText = `${a.title} — ${a.employer}${o.start ? ` (${new Date(`${o.start}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}${o.end ? ` – ${new Date(`${o.end}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : " – present"})` : ""}
${journal.length ? journal.slice().reverse().map((j) => `• ${j.text}`).join("\n") : "• [Add what you did and achieved: use your work journal below]"}`;
  const refText = `Hi ${o.manager?.split(" ")[0] ?? "[name]"},

Thank you for everything during my time at ${a.employer}. I've learned a lot, especially [one thing in your own words].

Would you be willing to act as a reference for future applications? A short LinkedIn recommendation would also mean a lot, if you have a moment.

Thanks again,
${me || "[Your name]"}`;
  const withdrawText = `Dear Hiring Team,

Thank you for considering my application. I've accepted another offer, so I'd like to withdraw my application. I appreciate your time and hope to stay in touch.

Kind regards,
${me || "[Your name]"}`;

  return (
    <div className="space-y-4">
      <Link href="/work" className="text-sm text-accent font-semibold">← My job</Link>

      {/* Header and next step */}
      <section className="card p-4 gradient-hero space-y-3" data-jump="Next step">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-snug">{a.title}</h1>
            <p className="text-muted">{a.employer}{a.location ? ` · ${a.location}` : ""}</p>
          </div>
          <span className="chip shrink-0 font-semibold">{STATE_LABEL[o.state]}</span>
        </div>
        {o.state !== "declined" && (
          <ol className="grid grid-cols-4 gap-1 text-[11px] text-center">
            {STATE_ORDER.map((s, i) => (
              <li key={s}><div className="h-1.5 rounded-full mb-1" style={{ background: i <= step ? "var(--accent)" : "var(--surface-2)" }} />{["Offer", "Accepted", "Working", "Finished"][i]}</li>
            ))}
          </ol>
        )}

        {o.state === "considering" && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm"><b>Decide{o.respondBy ? ` by ${fmtDay(o.respondBy)}` : ""}.</b> Check the points below first. Then reply to them, and tap the matching button so the app knows.</p>
            {mail ? (
              <div className="flex flex-wrap gap-2">
                <Link href={`/emails/${mail}?mode=accept`} className="btn btn-ghost !text-sm">✉️ Reply: accept</Link>
                <Link href={`/emails/${mail}?mode=decline`} className="btn btn-ghost !text-sm">✉️ Reply: decline</Link>
              </div>
            ) : <p className="text-xs text-muted">Reply to them the way they contacted you (email or phone).</p>}
            <div className="grid grid-cols-2 gap-2">
              <form action={setOppState.bind(null, id, "accepted")}><button className="btn btn-primary w-full">✅ I&apos;m accepting</button></form>
              <form action={setOppState.bind(null, id, "declined")}><button className="btn btn-ghost w-full">👎 I&apos;m declining</button></form>
            </div>
          </div>
        )}
        {o.state === "accepted" && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm">🎉 <b>Accepted.</b> {o.start ? `${(daysUntil(o.start) ?? 0) > 0 ? `You start in ${daysUntil(o.start)} days (${fmtDay(o.start)}).` : "Your start date is here."}` : "Add your start date below."} {prepLeft ? `${prepLeft} thing${prepLeft > 1 ? "s" : ""} left to get ready.` : "You're ready."}</p>
            <div className="flex flex-wrap gap-2">
              <a href="#ready" className="btn btn-primary !text-sm">Getting ready →</a>
              <form action={setOppState.bind(null, id, "started")}><button className="btn btn-ghost !text-sm">💼 I&apos;ve started</button></form>
            </div>
          </div>
        )}
        {o.state === "started" && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
            <p className="text-sm">💼 <b>In the role.</b> Each week, log your hours{isUkStudent() ? ` (to stay within ${H} h in term time)` : ""} and one line in your journal: it becomes your CV.</p>
            <div className="flex flex-wrap gap-2">
              <a href="#hours" className="btn btn-primary !text-sm">Log hours →</a>
              <a href="#journal" className="btn btn-ghost !text-sm">Journal →</a>
              <form action={setOppState.bind(null, id, "finished")}><button className="btn btn-ghost !text-sm">🏁 It&apos;s finished</button></form>
            </div>
          </div>
        )}
        {o.state === "finished" && (
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1">🏁 <b>Finished.</b> Finish well: reference, LinkedIn, CV. <a href="#finish" className="text-accent font-semibold">Go →</a></span>
            <form action={setOppState.bind(null, id, "started")}><button className="btn btn-ghost !text-xs">↩︎ Still working here</button></form></div>
        )}
        {o.state === "declined" && (
          <div className="flex items-center gap-2 text-sm"><span className="flex-1">You declined this offer.</span><form action={setOppState.bind(null, id, "considering")}><button className="btn btn-ghost !text-sm">↩︎ Undo</button></form></div>
        )}
        <Link href={`/applications/${id}`} className="text-xs text-accent font-semibold inline-block">Open the application ({APP_STATUS[a.status] ?? a.status}) →</Link>
      </section>

      <LimitsNote topic="work" max={2} />

      {o.state !== "declined" && (
        <section className="card p-4 space-y-2" id="checks">
          <h2 className="font-bold">Checks</h2>
          <ul className="space-y-1.5 text-sm">
            {checks(a, o, det, otherHours, otherMissing).map((c, i) => (
              <li key={i} className="flex gap-2"><span style={{ color: TONE[c.tone] }}>{c.tone === "good" ? "✓" : c.tone === "bad" ? "✗" : "!"}</span>
                <span className="flex-1">{c.text}{c.href && <> <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold whitespace-nowrap">Check ↗</a></>}</span></li>
            ))}
          </ul>
          {otherOffers.length > 0 && <Link href={`/compare?ids=${[a.job_id, ...otherOffers.map((x) => x.job_id)].slice(0, 4).join(",")}`} className="btn btn-ghost !text-sm">⇄ Compare with your other offer{otherOffers.length > 1 ? "s" : ""}</Link>}
        </section>
      )}

      <section className="card p-4 space-y-3" id="details">
        <h2 className="font-bold">Offer details</h2>
        {sp.saved && <p className="text-sm" style={{ color: "var(--good)" }}>✓ Saved.</p>}
        <form action={saveOpportunity.bind(null, id)} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <label><span className="text-muted font-semibold">Pay</span><input name="pay" defaultValue={o.pay ?? a.salary ?? ""} placeholder="e.g. £12.50 per hour or £24,000 a year" className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Hours per week</span><input name="hours" type="number" min={0} max={80} step="0.5" defaultValue={o.hours ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Start date</span><input name="start" type="date" defaultValue={o.start ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">End date</span><input name="end" type="date" defaultValue={o.end ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Reply to them by</span><input name="respondBy" type="date" defaultValue={o.respondBy ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Address</span><input name="address" defaultValue={o.address ?? a.location ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Manager / contact</span><input name="manager" defaultValue={o.manager ?? ""} className="input mt-0.5" /></label>
          <label><span className="text-muted font-semibold">Their email</span><input name="managerEmail" type="email" defaultValue={o.managerEmail ?? ""} className="input mt-0.5" /></label>
          <label className="sm:col-span-2"><span className="text-muted font-semibold">Notes</span><textarea name="notes" rows={2} defaultValue={o.notes ?? ""} className="input mt-0.5" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="contract" defaultChecked={!!o.contract} className="w-4 h-4" /> I have the offer or contract in writing</label>
          <button className="btn btn-primary sm:col-span-2">Save details</button>
        </form>
        {(a.start_date || a.duration || a.employment_type) && <p className="text-xs text-muted">From the advert: {[a.start_date, a.duration, a.employment_type].filter(Boolean).join(" · ")}</p>}
      </section>

      {["accepted", "started"].includes(o.state) && (
        <section className="card p-4" id="ready">
          <div className="flex items-baseline justify-between"><h2 className="font-bold">Getting ready</h2><span className="text-xs text-muted">{prep.length - prepLeft}/{prep.length} done</span></div>
          <ul className="divide-y divide-line mt-1">
            {prep.map((i) => <Tick key={i.id} id={id} item={i} done={done.includes(i.id)} />)}
          </ul>
        </section>
      )}

      {["accepted", "started"].includes(o.state) && otherApps.length > 0 && (
        <section className="card p-4 space-y-2" id="others">
          <h2 className="font-bold">Your other applications</h2>
          <p className="text-xs text-muted">Now that you&apos;ve accepted, withdraw politely from these (email them the text below), then mark each one.</p>
          <ul className="divide-y divide-line">
            {otherApps.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-2 text-sm">
                <Link href={`/applications/${x.id}`} className="flex-1 min-w-0 truncate">{x.employer}: {x.title}</Link>
                <span className="chip !py-0.5 shrink-0">{APP_STATUS[x.status] ?? x.status}</span>
                <form action={x.status === "offer" ? setOppState.bind(null, x.id, "declined") : setApplicationStatus.bind(null, x.id, "withdrawn")}><button className="btn btn-ghost !py-1 !px-2 !text-xs">Withdrawn</button></form>
              </li>
            ))}
          </ul>
          <details><summary className="text-sm font-semibold cursor-pointer text-accent">Withdrawal email text</summary><div className="mt-2"><CopyBox text={withdrawText} rows={7} /></div></details>
        </section>
      )}

      {o.state !== "considering" && o.state !== "declined" && (
        <section className="card p-4 space-y-3" id="hours">
          <div className="flex items-baseline justify-between"><h2 className="font-bold">Hours</h2><span className="text-xs text-muted tabular-nums">{totalH} h logged{rate ? ` · about £${(totalH * rate).toFixed(0)} before tax` : ""}</span></div>
          {sp.error === "hours" && <p className="text-sm" style={{ color: "var(--bad)" }}>Enter hours between 0 and 80.</p>}
          <form action={logWork.bind(null, id)} className="flex flex-wrap gap-2 items-end text-xs">
            <input type="hidden" name="kind" value="hours" />
            <label className="flex-1 min-w-36"><span className="text-muted font-semibold">Week of</span><input name="day" type="date" defaultValue={today} className="input mt-0.5" /></label>
            <label className="w-24"><span className="text-muted font-semibold">Hours</span><input name="hours" type="number" min={0} max={80} step="0.5" required className="input mt-0.5" /></label>
            <button className="btn btn-primary">Save week</button>
          </form>
          {isUkStudent() && <p className="text-xs text-muted">Term time: up to {H} h a week on your Student visa. Full-time only in official vacations{det.earliestStartSummer ? ` (your summer: ${fmtDay(det.earliestStartSummer)} – ${fmtDay(det.latestEndSummer)})` : ""}. Other vacations (Christmas, Easter) count too: check your university&apos;s dates.</p>}
          <ul className="divide-y divide-line text-sm">
            {hours.slice(0, 16).map((h) => {
              const vac = inVacation(mondayOf(h.day), det);
              const total = weekTotals.get(h.day) ?? Number(h.hours);
              const over = isUkStudent() && vac !== true && total > H;
              return (
                <li key={h.id} className="py-1.5 flex items-center gap-2">
                  <span className="flex-1">Week of {fmtDay(h.day)}{isUkStudent() && <span className="text-xs text-muted"> · {vac === true ? "summer vacation" : vac === false ? "outside your summer break" : "term or vacation?"}</span>}</span>
                  <b className="tabular-nums" style={over ? { color: "var(--bad)" } : undefined}>{Number(h.hours)} h{total > Number(h.hours) && <span className="text-xs text-muted font-normal"> ({total} h all jobs)</span>}</b>
                  <form action={deleteWorkLog.bind(null, id, String(h.id))}><button className="text-xs text-muted px-1" aria-label="Delete">✕</button></form>
                  {over && <span className="basis-full text-xs" style={{ color: "var(--bad)" }}>Over {H} h: only allowed if this was an official vacation week (e.g. Christmas or Easter). If it was term time, talk to your manager about cutting hours</span>}
                </li>
              );
            })}
            {!hours.length && <li className="py-1.5 text-muted">No hours logged yet.</li>}
          </ul>
        </section>
      )}

      {o.state !== "considering" && o.state !== "declined" && (
        <section className="card p-4 space-y-3" id="journal">
          <h2 className="font-bold">Work journal</h2>
          <p className="text-xs text-muted">One line a week about what you did, built or learned, with numbers if you can. It becomes your CV and interview stories.</p>
          <form action={logWork.bind(null, id)} className="space-y-2">
            <input type="hidden" name="kind" value="journal" />
            <textarea name="text" rows={2} required minLength={3} maxLength={1000} placeholder="e.g. Tested 40 PCBs and found a soldering fault that cut rework by half" className="input" />
            <div className="flex gap-2 items-center"><input name="day" type="date" defaultValue={today} className="input !w-auto" /><button className="btn btn-primary">Add</button></div>
          </form>
          <ul className="space-y-1.5 text-sm">
            {journal.slice(0, 30).map((j) => (
              <li key={j.id} className="flex gap-2"><span className="text-xs text-muted tabular-nums shrink-0 pt-0.5">{fmtDay(j.day)}</span><span className="flex-1">{j.text}</span>
                <form action={deleteWorkLog.bind(null, id, String(j.id))}><button className="text-xs text-muted px-1" aria-label="Delete">✕</button></form></li>
            ))}
          </ul>
        </section>
      )}

      {["started", "finished"].includes(o.state) && (
        <section className="card p-4 space-y-3" id="finish">
          <h2 className="font-bold">Finishing well</h2>
          <ul className="divide-y divide-line">{finishItems.map((i) => <Tick key={i.id} id={id} item={i} done={done.includes(i.id)} />)}</ul>
          <details><summary className="text-sm font-semibold cursor-pointer text-accent">Reference request text</summary><div className="mt-2"><CopyBox text={refText} rows={9} /></div></details>
          <div id="cv"><p className="text-sm font-semibold mb-1">Your CV entry (from your journal)</p><CopyBox text={cvText} rows={6} label="Copy CV entry" />
            <p className="text-xs text-muted mt-1">Then add it to your CV and to LinkedIn. Only include what you really did.</p></div>
        </section>
      )}
    </div>
  );
}

function Tick({ id, item, done }: { id: string; item: { id: string; title: string; why: string; href?: string }; done: boolean }) {
  return (
    <li className="py-2.5 flex gap-3 items-start">
      <form action={toggleOppItem.bind(null, id, item.id)}>
        <button aria-label={done ? "Mark not done" : "Mark done"} className="w-6 h-6 rounded-md border grid place-items-center mt-0.5 shrink-0"
          style={{ borderColor: done ? "var(--good)" : "var(--line)", background: done ? "var(--good)" : "transparent", color: "#fff" }}>{done ? "✓" : ""}</button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-sm ${done ? "line-through text-muted" : ""}`}>{item.title}</p>
        {!done && <p className="text-xs text-muted">{item.why}</p>}
        {!done && item.href && (item.href.startsWith("#") || item.href.startsWith("/")
          ? <a href={item.href} className="text-xs text-accent font-semibold">Go →</a>
          : <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold">Open ↗</a>)}
      </div>
    </li>
  );
}
