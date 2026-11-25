import Link from "next/link";
import { pool } from "@/db";
import { oppOf, daysUntil, fmtDay } from "@/lib/opportunity";

/** Home: shown only while you have an offer or a job on the go. */
export async function WorkCard() {
  const r = await pool.query(`select a.id, a.notes, j.title, j.employer from applications a join jobs j on j.id = a.job_id
     where a.status = 'offer' or a.notes like '%"opportunity"%' order by a.updated_at desc limit 10`);
  const live = r.rows.map((a) => ({ ...a, o: oppOf(a.notes) })).filter((a) => !["declined", "finished"].includes(a.o.state)).slice(0, 3);
  if (!live.length) return null;
  const line = (o: ReturnType<typeof oppOf>) => {
    if (o.state === "considering") { const d = daysUntil(o.respondBy); return d != null ? `🎉 Offer · decide by ${fmtDay(o.respondBy)}` : "🎉 Offer · check it and decide"; }
    if (o.state === "accepted") { const d = daysUntil(o.start); return d != null && d > 0 ? `🚀 Starts in ${d} day${d > 1 ? "s" : ""}` : "🚀 Getting ready to start"; }
    return "💼 In the role · log this week's hours";
  };
  return (
    <section className="card p-4 gradient-hero" data-jump="My job">
      <div className="flex items-baseline justify-between mb-2"><h2 className="font-bold text-lg">My job</h2><Link href="/work" className="text-xs text-accent font-semibold">All →</Link></div>
      <ul className="space-y-2">
        {live.map((a) => (
          <li key={a.id}><Link href={`/work/${a.id}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1"><span className="font-semibold block truncate">{a.employer}: {a.title}</span><span className="text-sm text-muted">{line(a.o)}</span></span>
            <span className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0">Open</span>
          </Link></li>
        ))}
      </ul>
    </section>
  );
}
