import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pgConfig } from "../src/db/config";
if (process.env.VERCEL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL) { console.log("No database connected yet: skipping. Connect Supabase in Vercel → Storage, then Redeploy."); process.exit(0); }

const pool = new pg.Pool({ ...pgConfig("direct"), max: 1 });
await migrate(drizzle(pool, { casing: "snake_case" }), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await pool.query(`insert into agent_state (id) values (1) on conflict do nothing`);

// Supabase exposes the public schema through its REST API. Row-level security with no policies
// blocks that API completely; the app's own database role (table owner) is unaffected.
const tables = await pool.query(`select tablename from pg_tables where schemaname = 'public'`);
for (const t of tables.rows) await pool.query(`alter table public."${t.tablename}" enable row level security`);

console.log(`Migrations applied; row-level security enabled on ${tables.rowCount} tables.`);
await pool.end();
