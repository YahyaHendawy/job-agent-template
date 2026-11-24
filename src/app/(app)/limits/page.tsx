import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { limits } from "@/lib/limits";
import { inboxAddress } from "@/components/Limits";

/** Everything the app can't do, and what to do instead. */
export default async function Limits() {
  const list = limits({ inbox: await inboxAddress() });
  return (
    <div className="space-y-3">
      <PageHeader title="What I can't do" subtitle="So nothing slips through. For each one, here's what to do instead." />
      {list.map((l) => (
        <section key={l.id} className="card p-4">
          <h2 className="font-bold"><span className="mr-1.5">{l.icon}</span>{l.title}</h2>
          <p className="text-sm text-muted mt-1">{l.detail}</p>
          <p className="text-sm mt-2"><b>👉 Instead:</b> {l.instead}</p>
          {l.href && <Link href={l.href} className="text-sm text-accent font-semibold inline-block mt-1">Go there →</Link>}
        </section>
      ))}
      <p className="text-xs text-muted">Everything else (finding jobs, checking eligibility, preparing CVs, watching your job inbox, reminders, filling forms on your Mac) runs by itself.</p>
    </div>
  );
}
