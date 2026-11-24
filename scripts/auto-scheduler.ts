/** Build step: creates the scheduler on a new copy's first deploy. Never fails the build. */
import { ensureScheduler } from "../src/lib/scheduler";
try {
  if (!process.env.VERCEL) console.log("Scheduler: skipped (not on Vercel).");
  else if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) console.log("Scheduler: skipped until a database is connected.");
  else console.log(`Scheduler: ${(await ensureScheduler()).message}`);
} catch (e) {
  console.log(`Scheduler: not set up yet (${(e as Error).message}). The setup checklist in the app can retry.`);
}
