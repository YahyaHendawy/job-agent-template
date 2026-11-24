import type { PoolConfig } from "pg";

const LOCAL = "postgres://agent:agent@127.0.0.1:54329/agent";

/**
 * Connection settings. Locally: embedded Postgres. On Vercel: the Supabase integration provides
 * POSTGRES_URL (pooled, for the app) and POSTGRES_URL_NON_POOLING (direct, for migrations).
 */
export function pgConfig(kind: "app" | "direct" = "app"): PoolConfig {
  const raw = process.env.DATABASE_URL
    || (kind === "direct" ? process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL : process.env.POSTGRES_URL)
    || LOCAL;
  const url = new URL(raw);
  const remote = !["127.0.0.1", "localhost"].includes(url.hostname);
  // TLS is always used for remote databases; sslmode params are removed so node-postgres uses the explicit setting below.
  for (const p of ["sslmode", "supa", "pgbouncer"]) url.searchParams.delete(p);
  return {
    connectionString: url.toString(),
    ssl: remote ? { rejectUnauthorized: false } : undefined,
  };
}
