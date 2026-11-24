import { pool } from "@/db";

export type NotificationMode = "action" | "all" | "important" | "quiet";

export const DEFAULTS = {
  notifications: { mode: "action" as NotificationMode, maxAllPer10Min: 12 },
  search: { intervalMinutes: 240, politeDelayMs: 2500, autoSlowed: false, guardChangedAt: null as string | null },
  goals: { applicationsPerWeek: 5 },
  automation: {
    // Real submissions always need explicit approval. A pre-authorised policy can only be
    // enabled by the owner from Settings and is restricted to verified workflows.
    requireApprovalForSubmission: true,
    autoPrepare: true,
    autoPrepareMinScore: 0,    // "prepare everything" — every open job the owner is allowed to apply for; each shows reasons to submit / not
    autoPreparePerCycle: 300,
    alwaysPreparePlacements: true, // "apply for all placements just in case"
    autoSubmit: false,   // extension submits when nothing needs the owner (10 s cancellable countdown)
    autoConsent: false,  // extension ticks standard privacy-notice acknowledgements
  },
};
export type Settings = typeof DEFAULTS;

export async function getSettings(): Promise<Settings> {
  const r = await pool.query(`select key, value from settings`);
  const out: any = structuredClone(DEFAULTS);
  for (const row of r.rows) if (row.key in out) out[row.key] = { ...out[row.key], ...row.value };
  return out;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Partial<Settings[K]>) {
  const current = (await getSettings())[key];
  await pool.query(
    `insert into settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify({ ...current, ...value })],
  );
}
