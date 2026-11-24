import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { addJobByLink } from "@/app/actions";

export default async function AddJob({ searchParams }: { searchParams: Promise<{ error?: string; url?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <Link href="/jobs" className="text-sm text-accent font-semibold">← Jobs</Link>
      <PageHeader title="Add a job by link" subtitle="Found something yourself? Paste it and the agent takes over." />
      {sp.error === "url" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Paste the full link (starting with https://).</p>}
      {sp.error === "title" && <p className="card p-3 text-sm" style={{ color: "var(--warn)" }}>That site didn't let the app read the page. Add the job title and employer below and try again.</p>}
      <form action={addJobByLink} className="card p-4 space-y-3">
        <label className="block"><span className="text-sm font-semibold">Job link</span>
          <input name="url" type="url" required defaultValue={sp.url ?? ""} placeholder="https://www.linkedin.com/jobs/view/…" className="input mt-1" /></label>
        <details open={sp.error === "title"}>
          <summary className="text-sm font-semibold cursor-pointer">Add details (only if the page can't be read)</summary>
          <div className="space-y-2 mt-2">
            <input name="title" placeholder="Job title" className="input" />
            <input name="employer" placeholder="Employer" className="input" />
            <input name="location" placeholder="Location (e.g. city, country)" className="input" />
            <textarea name="description" rows={5} placeholder="Paste the job description (optional, makes the CV better)" className="input" />
          </div>
        </details>
        <button className="btn btn-primary w-full !py-3">Add and prepare my application</button>
        <p className="text-xs text-muted">The agent checks eligibility for your visa, tailors your CV and adds it to Applications → To decide.</p>
      </form>
    </div>
  );
}
