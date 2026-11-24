import { Ring } from "./charts";
import { persona } from "@/lib/persona";
export const ELIG: Record<string, { label: string; color: string }> = {
  eligible: { label: "Eligible", color: "var(--good)" },
  potentially_eligible: { label: "Potentially eligible", color: "var(--warn)" },
  manual_verification: { label: "Verify manually", color: "var(--accent)" },
  ineligible: { label: "Ineligible", color: "var(--bad)" },
};

export const CATEGORY: Record<string, string> = {
  summer_internship: "Summer internship", placement: "Placement year", part_time: "Part-time",
  temporary: "Temporary", research: "Research", graduate: "Graduate", insight_programme: "Insight programme (unpaid/training)", other: "Other",
};

export const APP_STATUS: Record<string, string> = {
  draft: "Draft", preparing: "Preparing", awaiting_approval: "To decide", approved: "Going ahead", declined: "Not doing", submitting: "Submitting",
  submitted: "Submitted", assessment: "Assessment", interview: "Interview", offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn", failed: "Failed",
};

export function EligChip({ status }: { status: string }) {
  const e = ELIG[status] ?? { label: status, color: "var(--muted)" };
  return <span className="chip" style={{ color: e.color, borderColor: "color-mix(in srgb, currentColor 35%, transparent)" }}>{e.label}</span>;
}

export function Score({ value }: { value: number }) {
  return <Ring value={value} />;
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: persona().timeZone }) : "—";
export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: persona().timeZone });

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export const LEVEL_COLOR: Record<string, string> = { info: "var(--muted)", success: "var(--good)", warning: "var(--warn)", error: "var(--bad)" };
