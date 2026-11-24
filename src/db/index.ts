import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { pgConfig } from "./config";

const globalForDb = globalThis as unknown as { pool?: pg.Pool };

export const pool =
  globalForDb.pool ??
  new pg.Pool({
    ...pgConfig("app"),
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 5)),
    idleTimeoutMillis: 10_000,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export { schema };
