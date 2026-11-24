import Link from "next/link";
import { orders, season } from "@/lib/manager";

/** Home: the manager's top three orders and the season, one tap to the full plan. */
export async function ManagerCard() {
  const [o, se] = [await orders(), season()];
  return (
    <section className="card p-4" data-jump="Manager">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-bold text-lg">Your manager</h2>
        <span className="text-xs font-semibold" style={{ color: se.tone }}>{se.title.split(":")[0]}</span>
      </div>
      <ol className="space-y-1.5 mt-2">
        {o.slice(0, 3).map((x, i) => (
          <li key={x.title} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>{i + 1}</span>
            <Link href={x.href} className="flex-1 min-w-0 truncate font-semibold">{x.icon} {x.title}</Link>
          </li>
        ))}
      </ol>
      <Link href="/manager" className="btn btn-ghost w-full mt-3 !text-sm">Full plan: orders, scorecard, skills, monthly moves →</Link>
    </section>
  );
}
