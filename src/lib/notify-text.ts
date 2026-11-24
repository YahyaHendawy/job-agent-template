/** Shared wording helpers so every notification reads the same way: emoji + what happened, then what to do. */

import { persona } from "@/lib/persona";

/** "Thu 26 Nov, 5pm" in the owner's time zone. */
export function whenLondon(d: Date | string) {
  const date = new Date(d);
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: persona().timeZone });
  const time = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: persona().timeZone })
    .replace(":00", "").replace(" ", "");
  return `${day}, ${time}`;
}

/** "today", "tomorrow", "in 3 days" (owner's calendar days). */
export function inDays(d: Date | string) {
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: persona().timeZone });
  const a = Date.parse(key(new Date())), b = Date.parse(key(new Date(d)));
  const n = Math.round((b - a) / 86400000);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Trim long job titles/subjects so the important part fits on a lock screen. */
export const short = (s: string, max = 60) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Plain-English names for background jobs, used if one fails. */
export const TASK_NAMES: Record<string, string> = {
  search_cycle: "job search", check_source: "checking a job site", cycle_complete: "finishing a search",
  deadline_scan: "deadline check", approval_digest: "ready-to-submit check", backup: "weekly backup",
  check_inbox: "checking your job inbox", daily_summary: "morning summary", weekly_report: "weekly report",
  prepare_application: "preparing an application", push_event: "sending a notification",
};
