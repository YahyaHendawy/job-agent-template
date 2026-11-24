/** Optional: writes your own notes to Settings → Setup log. Run: npx tsx --env-file=.env scripts/setup-log.ts */
import pg from "pg";
import { pgConfig } from "../src/db/config";
const entries: { date: string; what: string; where: string; details?: string; status: "done" | "waiting_on_you" | "optional"; next?: string }[] = [];
const c = new pg.Client(pgConfig("direct"));
await c.connect();
await c.query(`insert into settings (key, value, updated_at) values ('setupLog', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(entries)]);
console.log(`Setup log written (${entries.length} entries).`);
await c.end();
