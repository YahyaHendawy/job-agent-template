import Link from "next/link";
import { isUkStudent, loadPersona } from "@/lib/persona";
import { pool } from "@/db";
import { markEmailHandled, setDetail } from "@/app/actions";
import { unanswered } from "@/lib/written";

type Item = { key: string; icon: string; title: string; sub?: string; href?: string; cta?: string; external?: boolean; doneAction?: () => Promise<void>; urgent?: boolean; choices?: { label: string; action: () => Promise<void> }[] };

const EMAIL_LABEL: Record<string, [string, string]> = {
  interview: ["📅", "Interview invitation"], assessment: ["🧪", "Assessment to complete"], offer: ["🎉", "Offer"],
  verification: ["✉️", "Verify your email"], recruiter: ["💬", "Reply needed"],
};

/** Everything that needs the owner, newest/most urgent first, each with one button. Empty = nothing to do. */
export async function TodoList({ max, quickOnly = false }: { max?: number; quickOnly?: boolean } = {}) {
  await loadPersona();
  const [mail, ready, deadlines, det, autofill, inbox] = await Promise.all([
    pool.query(`select e.id, e.category, e.subject, e.from_name, e.link, e.received_at, j.employer, j.title
                from emails e left join applications a on a.id = e.application_id left join jobs j on j.id = a.job_id
                where e.needs_action and e.handled_at is null order by e.received_at desc limit 10`),
    pool.query(`select a.id, a.status, a.form_questions, a.written, j.title, j.employer, j.deadline from applications a join jobs j on j.id = a.job_id
                where a.status in ('awaiting_approval','approved')
                order by (a.status = 'approved') desc, (j.deadline is not null and j.deadline > now()) desc, j.deadline asc nulls last, j.match_score desc limit 60`),
    pool.query(`select count(*)::int n from applications a join jobs j on j.id = a.job_id where a.status in ('awaiting_approval','approved') and j.deadline between now() and now() + interval '3 days'`),
    pool.query(`select value from settings where key = 'applicationDetails'`),
    pool.query(`select count(*)::int n from api_tokens where revoked_at is null`),
    pool.query(`select 1 from settings where key = 'emailImap'`),
  ]);
  const items: Item[] = [];
  for (const e of mail.rows) {
    const [icon, label] = EMAIL_LABEL[e.category] ?? ["📩", "Email"];
    items.push({
      key: `mail-${e.id}`, icon, urgent: ["interview", "offer", "assessment"].includes(e.category),
      title: `${label}${e.employer ? `: ${e.employer}` : e.from_name ? `: ${e.from_name}` : ""}`,
      sub: e.subject, href: `/emails/${e.id}`, cta: ["interview", "offer", "recruiter"].includes(e.category) ? "Reply" : "View", doneAction: markEmailHandled.bind(null, e.id),
    });
  }
  // Applications you said yes to: each gets its own next step
  const going = ready.rows.filter((a) => a.status === "approved");
  for (const a of going.slice(0, 8)) {
    const qs = unanswered(a);
    const soonG = a.deadline && new Date(a.deadline).getTime() - Date.now() < 3 * 86400_000;
    items.push(qs.length
      ? { key: `q-${a.id}`, icon: "✍️", urgent: !!soonG, title: `${a.employer}: write ${qs.length} short answer${qs.length > 1 ? "s" : ""}, then send`, sub: qs.map((q) => q.question).join(" · "), href: `/applications/${a.id}#answers`, cta: "Answer" }
      : { key: `go-${a.id}`, icon: "🚀", urgent: !!soonG, title: `Send your application: ${a.employer}`, sub: `${a.title} · everything is ready, open it on your Mac and autofill does the rest`, href: `/applications/${a.id}#next-steps`, cta: "Apply" });
  }
  // Still to decide: closing-soon ones individually, the rest as one item
  const undecided = ready.rows.filter((a) => a.status === "awaiting_approval");
  const soon = undecided.filter((a) => a.deadline && new Date(a.deadline).getTime() - Date.now() < 3 * 86400_000);
  for (const a of soon) items.push({ key: `dl-${a.id}`, icon: "⏰", urgent: true, title: `Decide soon: ${a.employer} closes ${new Date(a.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, sub: a.title, href: `/applications/${a.id}`, cta: "Decide" });
  const rest = undecided.filter((a) => !soon.includes(a));
  if (rest.length) items.push({ key: "decide", icon: "🤔", title: `${rest.length}${rest.length === 60 ? "+" : ""} application${rest.length > 1 ? "s" : ""} to decide: yes or no`, sub: `Starts with ${rest[0].employer}. The next one opens after each decision`, href: `/applications/${rest[0].id}`, cta: "Start" });
  const d = det.rows[0]?.value ?? {};
  // One-tap answers to simple declarations (no form needed)
  if (isUkStudent() && !d.futureSponsorship) items.push({ key: "fs", icon: "🛂", title: "Forms ask: “Will you need visa sponsorship now or in the future?”", sub: "Yes is truthful for most students (needed for a permanent job after your Student visa)", choices: [{ label: "Answer Yes", action: setDetail.bind(null, "futureSponsorship", "yes") }, { label: "Ask me each time", action: setDetail.bind(null, "futureSponsorship", "ask") }] });
  if (!d.drivingLicence) items.push({ key: "dl", icon: "🚗", title: "Do you hold a full driving licence?", choices: [{ label: "Yes", action: setDetail.bind(null, "drivingLicence", "yes") }, { label: "No", action: setDetail.bind(null, "drivingLicence", "no") }] });
  if (!d.unspentConvictions) items.push({ key: "uc", icon: "📋", title: "Any unspent criminal convictions?", sub: "Asked on many UK forms", choices: [{ label: "No", action: setDetail.bind(null, "unspentConvictions", "no") }, { label: "Yes", action: setDetail.bind(null, "unspentConvictions", "yes") }] });
  const missing = [...(d.addressChoice === "area-only" ? [] : ["addressLine1"]), "postcode", ...(isUkStudent() ? ["visaExpiry"] : []), "earliestStartSummer", "latestEndSummer"].filter((k) => !d[k]).length;
  if (missing) items.push({ key: "details", icon: "📝", title: `Fill in ${missing} application detail${missing > 1 ? "s" : ""}`, sub: "Needed on most forms (address, visa expiry, dates…)", href: "/settings/details", cta: "Fill in" });
  if (!inbox.rowCount) items.push({ key: "inbox", icon: "📬", title: "Connect your job inbox", sub: "So interview invites and replies are never missed", href: "/settings/email", cta: "Connect" });
  if (!autofill.rows[0].n) items.push({ key: "autofill", icon: "🧩", title: "Connect Safari autofill on your Mac", href: "/settings/autofill", cta: "Set up" });

  if (quickOnly) {
    const quick = items.filter((i) => i.choices || ["details", "inbox", "autofill"].includes(i.key));
    if (!quick.length) return null;
    return <TodoCard title="Quick answers" note="One tap each; used on every form" items={quick} />;
  }
  const shown = max ? items.slice(0, max) : items;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold text-lg">Needs you</h2>
        <span className="text-xs text-muted">{items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : ""}{deadlines.rows[0].n ? ` · ${deadlines.rows[0].n} deadline${deadlines.rows[0].n > 1 ? "s" : ""} in 3 days` : ""}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm py-3" style={{ color: "var(--good)" }}>✓ All clear. Nothing needs you right now; the agent keeps working.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((it) => (
            <li key={it.key} className={`flex gap-3 py-2.5 ${it.choices ? "flex-wrap items-start" : "items-center"}`}>
              <span className="text-xl w-7 text-center shrink-0">{it.icon}</span>
              <div className={`min-w-0 ${it.choices ? "basis-[calc(100%-2.5rem)]" : "flex-1"}`}>
                <p className="font-semibold text-sm leading-snug" style={it.urgent ? { color: "var(--warn)" } : undefined}>{it.title}</p>
                {it.sub && <p className="text-xs text-muted truncate">{it.sub}</p>}
              </div>
              {it.choices ? (
                <div className="flex gap-1.5 ml-10">{it.choices.map((c) => <form key={c.label} action={c.action}><button className="btn btn-primary !py-1.5 !px-2.5 !text-xs">{c.label}</button></form>)}</div>
              ) : it.href && (it.external ? (
                <a href={it.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0">{it.cta}</a>
              ) : (
                <Link href={it.href} className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0">{it.cta}</Link>
              ))}
              {it.doneAction && <form action={it.doneAction}><button className="btn btn-ghost !py-1.5 !px-2.5 !text-xs" title="Mark done">✓</button></form>}
            </li>
          ))}
        </ul>
      )}
      {max && <Link href="/todo" className="btn btn-ghost w-full mt-2 !text-sm">{items.length > max ? `See all ${items.length} in Solo →` : "Open Solo →"}</Link>}
    </section>
  );
}

function TodoCard({ title, note, items }: { title: string; note: string; items: Item[] }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-1"><h2 className="font-bold">{title}</h2><span className="text-xs text-muted">{note}</span></div>
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.key} className="flex gap-3 py-2.5 flex-wrap items-center">
            <span className="text-xl w-7 text-center shrink-0">{it.icon}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold text-sm leading-snug">{it.title}</p>{it.sub && <p className="text-xs text-muted">{it.sub}</p>}</div>
            {it.choices ? <div className="flex gap-1.5 ml-10">{it.choices.map((c) => <form key={c.label} action={c.action}><button className="btn btn-primary !py-1.5 !px-2.5 !text-xs">{c.label}</button></form>)}</div>
              : it.href && <Link href={it.href} className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0">{it.cta}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
