import Link from "next/link";
import { pool } from "@/db";
import { limits, type LimitTopic } from "@/lib/limits";

export async function inboxAddress(): Promise<string | null> {
  const r = await pool.query(`select value->>'user' u from settings where key = 'emailImap'`).catch(() => ({ rows: [] as any[] }));
  return r.rows[0]?.u ?? null;
}

/** A short "Remember: I can't…" reminder for one screen. */
export async function LimitsNote({ topic, max = 3 }: { topic: LimitTopic; max?: number }) {
  const list = limits({ inbox: await inboxAddress() }).filter((l) => l.topics.includes(topic)).slice(0, max);
  if (!list.length) return null;
  return (
    <aside className="rounded-xl p-3 text-xs space-y-1.5 border border-dashed border-line" aria-label="What the app can't do">
      <p className="font-semibold text-muted">Remember, I can't do everything:</p>
      <ul className="space-y-1">
        {list.map((l) => <li key={l.id}><span className="mr-1">{l.icon}</span><b>{l.title}.</b> <span className="text-muted">{l.instead}</span></li>)}
      </ul>
      <Link href="/limits" className="text-accent font-semibold inline-block">Everything I can't do →</Link>
    </aside>
  );
}
