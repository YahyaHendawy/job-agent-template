import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, clientInfo } from "@/lib/auth";
import { audit } from "@/lib/events";
import { getDetails, saveDetails, detailFields } from "@/lib/details";
import type { ApplicationDetails } from "@/lib/answers";
import { PageHeader } from "@/components/ui";

async function save(f: FormData) {
  "use server";
  const u = await requireUser();
  const d: Record<string, string> = {};
  for (const field of detailFields()) d[field.key] = String(f.get(field.key) ?? "").trim().slice(0, 300);
  await saveDetails(d as ApplicationDetails);
  await audit("application_details_saved", { fields: Object.keys(d).filter((k) => d[k]) }, u.id, (await clientInfo()).ip);
  revalidatePath("/applications", "layout");
  redirect("/settings/details?saved=1");
}

export default async function DetailsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const d = await getDetails();
  const groups = [...new Set(detailFields().map((f) => f.group))];
  const filled = detailFields().filter((f) => (d as any)[f.key]).length;
  return (
    <div>
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Application details" subtitle={`Entered once, reused on every application · ${filled}/${detailFields().length} filled`} />
      {saved && <p className="card p-3 mb-3 text-sm" style={{ color: "var(--good)" }}>Saved. Every Apply Kit now uses these details.</p>}
      <p className="text-sm text-muted mb-4">Stored only in your private database. Visa answers are worked out automatically from your onboarding answers; diversity questions are always “Prefer not to say”.</p>
      <form action={save} className="space-y-4">
        {groups.map((g) => (
          <section key={g} className="card p-4 space-y-3">
            <h2 className="font-bold">{g}</h2>
            {detailFields().filter((f) => f.group === g).map((f) => (
              <label key={f.key} className="block">
                <span className="text-sm font-semibold">{f.label}</span>
                {f.options ? (
                  <select name={f.key} defaultValue={(d as any)[f.key] ?? ""} className="input mt-1">
                    {f.options.map((o) => <option key={o} value={o}>{o ? o[0].toUpperCase() + o.slice(1) : "Choose…"}</option>)}
                  </select>
                ) : (
                  <input name={f.key} type={f.type ?? "text"} defaultValue={(d as any)[f.key] ?? ""} className="input mt-1" autoComplete="off" />
                )}
                {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
              </label>
            ))}
          </section>
        ))}
        <button className="btn btn-primary w-full">Save details</button>
      </form>
    </div>
  );
}
