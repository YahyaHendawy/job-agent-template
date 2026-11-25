/** Server side: reads the saved look. The look itself (types, themes, CSS) lives in look.ts so pages can preview it live. */
import { pool } from "@/db";
import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/look";
export * from "@/lib/look";

export async function getAppearance(): Promise<Appearance> {
  try {
    const r = await pool.query(`select value from settings where key = 'appearance'`);
    const v = r.rows[0]?.value ?? {};
    return { ...DEFAULT_APPEARANCE, ...v, home: { ...DEFAULT_APPEARANCE.home, ...(v.home ?? {}) } };
  } catch { return DEFAULT_APPEARANCE; }
}

