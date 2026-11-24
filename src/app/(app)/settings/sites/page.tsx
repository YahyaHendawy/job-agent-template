import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { requireUser, clientInfo } from "@/lib/auth";
import { audit } from "@/lib/events";
import { enqueue } from "@/lib/queue";
import { kickRunner } from "@/lib/kick";
import { PageHeader } from "@/components/ui";
import { loadPersona, COUNTRIES } from "@/lib/persona";
import { joobleKeyName } from "@/connectors";

async function save(f: FormData) {
  "use server";
  const u = await requireUser();
  const cur = (await pool.query(`select value from settings where key = 'apiKeys'`)).rows[0]?.value ?? {};
  const val = (k: string) => String(f.get(k) ?? "").trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 100);
  const next = { ...cur };
  const P = await loadPersona();
  const joobleCodes = [...new Set(["QA", "EG", "UK", ...P.markets.map((m) => m.code)])].filter((c) => COUNTRIES[c]?.jooble);
  for (const k of ["reed", "adzunaId", "adzunaKey", "careerjet", ...joobleCodes.map(joobleKeyName)]) if (val(k)) next[k] = val(k);
  await pool.query(`insert into settings (key, value, updated_at) values ('apiKeys', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  if (next.reed) await pool.query(`update sources set enabled = true where kind = 'reed'`);
  if (next.adzunaId && next.adzunaKey) await pool.query(`update sources set enabled = true where kind = 'adzuna'`);
  for (const cc of joobleCodes)
    if (next[joobleKeyName(cc)]) await pool.query(`update sources set enabled = true where kind = 'jooble' and config->>'country' = $1`, [cc]);
  if (next.careerjet) await pool.query(`update sources set enabled = true where kind = 'careerjet'`);
  await audit("job_site_keys_saved", { reed: !!next.reed, adzuna: !!(next.adzunaId && next.adzunaKey) }, u.id, (await clientInfo()).ip);
  const slot = `keys-${new Date().toISOString()}`;
  await enqueue("search_cycle", { slot, trigger: "new job-site keys" }, { dedupeKey: `cycle:${slot}` });
  kickRunner(240_000);
  revalidatePath("/settings");
  redirect("/settings/sites?saved=1");
}

export default async function Sites({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const v = (await pool.query(`select value from settings where key = 'apiKeys'`)).rows[0]?.value ?? {};
  const P = await loadPersona();
  const targets = P.markets.map((m) => m.code).filter((c) => COUNTRIES[c]?.jooble);
  const uk = P.markets.some((m) => m.code === "UK");
  const st = (await pool.query(`select kind, bool_or(enabled) as on, max(last_checked_at) as checked, string_agg(distinct last_status, '; ') as status from sources where kind in ('reed','adzuna','jooble','careerjet') group by kind`)).rows;
  const status = (k: string) => st.find((s) => s.kind === k);
  const Box = ({ name, keys, steps, kind }: { name: string; keys: [string, string][]; steps: string[]; kind: string }) => {
    const s = status(kind);
    return (
      <section className="card p-4 space-y-3">
        <div className="flex items-center"><h2 className="font-bold flex-1">{name}</h2>
          <span className="chip" style={{ color: s?.on ? "var(--good)" : "var(--muted)" }}>{s?.on ? "On" : "Off"}</span></div>
        <ol className="text-sm list-decimal pl-5 space-y-1">{steps.map((x, i) => <li key={i} dangerouslySetInnerHTML={{ __html: x }} />)}</ol>
        {keys.map(([k, label]) => (
          <label key={k} className="block"><span className="text-sm font-semibold">{label}</span>
            <input name={k} className="input mt-1" autoComplete="off" placeholder={v[k] ? "Saved ✓ (leave blank to keep)" : "Paste here"} /></label>
        ))}
        {s?.status && s.status !== "ok" && <p className="text-xs" style={{ color: "var(--warn)" }}>Last check: {s.status}</p>}
      </section>
    );
  };
  return (
    <div className="space-y-4">
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Job sites" subtitle="Free official job-site APIs that add thousands of listings in your countries" />
      {saved && <p className="card p-3 text-sm" style={{ color: "var(--good)" }}>Saved. A search with the new sites has started.</p>}
      <form action={save} className="space-y-4">
        {uk && <Box name="Reed.co.uk (UK only)" kind="reed" keys={[["reed", "Reed API key"]]} steps={[
          'Open <a class="text-accent underline" href="https://www.reed.co.uk/developers/jobseeker" target="_blank">reed.co.uk/developers/jobseeker</a> and sign in or create a free Reed account.',
          "Fill in the short form (website: this app's address; usage: personal job search) and accept Reed's API terms.",
          "Your API key is shown on the page/emailed to you. Paste it below.",
        ]} />}
        <Box name="Adzuna" kind="adzuna" keys={[["adzunaId", "Adzuna App ID"], ["adzunaKey", "Adzuna App Key"]]} steps={[
          'Open <a class="text-accent underline" href="https://developer.adzuna.com/signup" target="_blank">developer.adzuna.com/signup</a> and register (free).',
          "After confirming your email, open your dashboard → API access details.",
          "Paste the App ID and App Key below.",
        ]} />
        {targets.length > 0 && <Box name={`Jooble (${targets.map((c) => COUNTRIES[c].name).join(", ")})`} kind="jooble" keys={targets.map((c) => [joobleKeyName(c), `Jooble ${COUNTRIES[c].name} key`] as [string, string])} steps={[
          ...targets.map((c) => `${COUNTRIES[c].name}: open <a class="text-accent underline" href="https://${COUNTRIES[c].jooble}.jooble.org/api/about" target="_blank">${COUNTRIES[c].jooble}.jooble.org/api/about</a> and fill the short form (Position: Student; Website: this app's address). The key arrives by email (check spam).`),
          "Each country has its own key. Paste each one below.",
        ]} />}
        <Box name="Careerjet" kind="careerjet" keys={[["careerjet", "Careerjet API key"]]} steps={[
          'Create a free publisher account at <a class="text-accent underline" href="https://www.careerjet.com/partners/register/as-publisher" target="_blank">careerjet.com/partners</a> (website: this app\'s address).',
          "Open your publisher account and copy the API key for your site. Paste it below.",
        ]} />
        <button className="btn btn-primary w-full">Save and search now</button>
      </form>
      <p className="text-xs text-muted">Keys are stored in your private database and only used to query these job sites.</p>
    </div>
  );
}
