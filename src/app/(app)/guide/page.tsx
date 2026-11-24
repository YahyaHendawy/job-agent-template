import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { WeeklyCard } from "@/components/WeeklyCard";
import { stages } from "@/lib/guide";
import { loadPersona, isUkStudent } from "@/lib/persona";

export default async function Guide() {
  const P = await loadPersona();
  const uni = P.universityShort || "your university";
  return (
    <div className="space-y-4">
      <PageHeader title="Guide" subtitle="The parts the app can't do for you — made as easy as possible" />
      <WeeklyCard />
      <section className="card p-4 space-y-3 text-sm">
        <h2 className="font-bold">After you apply: what happens next</h2>
        <p>Each application page shows step-by-step help when it reaches a new stage. The app moves it there automatically when the email arrives.</p>
        <ul className="space-y-1.5">
          {Object.entries(stages()).map(([k, s]) => <li key={k}>• <b>{s.title}</b></li>)}
        </ul>
        <Link href="/applications" className="btn btn-ghost !text-sm">Open Applications</Link>
      </section>
      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-bold">Every few months</h2>
        <ul className="space-y-1.5">
          <li>• Update your CV file and LinkedIn with new projects or grades, then tell the app (Settings → Application details).</li>
          <li>• Confirm {uni}&apos;s exact vacation dates and whether a placement year is approved ({uni} careers / course office).</li>
          {isUkStudent() && <li>• Check your visa conditions in your UKVI account before accepting any job.</li>}
        </ul>
      </section>
    </div>
  );
}
