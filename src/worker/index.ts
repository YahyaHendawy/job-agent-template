/**
 * Long-running worker for local development (or any always-on host).
 * The free cloud deployment uses /api/cron/tick instead; both share src/worker/runner.ts.
 */
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { pool } from "@/db";
import { recoverStale } from "@/lib/queue";
import { emit, setActivity } from "@/lib/events";
import { heartbeat, schedule, runOne } from "./runner";

const WORKER_ID = `${hostname()}-${randomBytes(3).toString("hex")}`;
let stopping = false;

async function main() {
  console.log(`[worker] ${WORKER_ID} starting`);
  await pool.query(`insert into agent_state (id) values (1) on conflict do nothing`);
  const recovered = await recoverStale(10);
  await heartbeat(WORKER_ID);
  await emit({ type: "agent_control", title: "Worker online", body: recovered ? `Recovered ${recovered} interrupted task(s) after restart.` : `Worker ${WORKER_ID} started.`, push: false });
  await setActivity(null);
  setInterval(() => heartbeat(WORKER_ID).catch(console.error), 15_000);
  setInterval(() => recoverStale(10).catch(console.error), 120_000);
  setInterval(() => schedule().catch(console.error), 60_000);
  await schedule();
  while (!stopping) {
    try {
      if (!(await runOne(WORKER_ID))) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error("[worker] loop error", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => { stopping = true; setTimeout(() => process.exit(0), 8000); });

main().catch((e) => { console.error(e); process.exit(1); });
