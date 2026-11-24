import { after } from "next/server";
import { drain } from "@/worker/runner";

/** After a user action queues work, process it right away instead of waiting for the next tick. */
export function kickRunner(budgetMs = 60_000) {
  after(async () => {
    try { await drain(`web-${Date.now().toString(36)}`, budgetMs, { schedule: false }); }
    catch (e) { console.error("[kick] drain failed", e); }
  });
}
