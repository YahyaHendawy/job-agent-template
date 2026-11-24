/** Activity feed events. Every real operation is recorded here; push delivery is queued from here. */
import { pool } from "@/db";
import { enqueue } from "./queue";

export type EventType =
  | "search_started" | "employer_checked" | "job_found" | "job_verified" | "job_closed" | "deadline_changed"
  | "eligibility_checked" | "cv_started" | "cv_completed" | "cover_letter_completed" | "application_opened"
  | "application_prepared" | "approval_requested" | "application_approved" | "application_submitted"
  | "submission_confirmed" | "application_failed" | "retry_scheduled" | "deadline_approaching"
  | "interview_detected" | "employer_response" | "search_completed" | "system_error" | "agent_control"
  | "source_failed" | "test_notification" | "security" | "info_needed" | "daily_summary";

const IMPORTANT = new Set<EventType>([
  "approval_requested", "application_submitted", "submission_confirmed", "application_failed",
  "deadline_approaching", "interview_detected", "employer_response", "system_error", "test_notification",
]);
const URGENT = new Set<EventType>(["interview_detected", "system_error", "test_notification", "employer_response"]);

/** Events that need the owner to do something. "Action needed only" mode pushes just these. */
export const ACTION_TYPES = new Set<EventType>([
  "approval_requested", "deadline_approaching", "interview_detected", "employer_response",
  "application_failed", "info_needed", "system_error", "test_notification", "daily_summary",
]);

export function importanceOf(type: EventType, level: string): "all" | "important" | "urgent" {
  if (URGENT.has(type)) return "urgent";
  if (IMPORTANT.has(type) || level === "error") return "important";
  return "all";
}

export type NewEvent = {
  type: EventType;
  title: string;
  body?: string;
  level?: "info" | "success" | "warning" | "error";
  importance?: "all" | "important" | "urgent";
  jobId?: string | null;
  applicationId?: string | null;
  url?: string;
  data?: Record<string, unknown>;
  simulated?: boolean;
  push?: boolean; // default true
};

export async function emit(e: NewEvent): Promise<number> {
  const level = e.level ?? "info";
  const importance = e.importance ?? importanceOf(e.type, level);
  const url = e.url ?? (e.applicationId ? `/applications/${e.applicationId}` : e.jobId ? `/jobs/${e.jobId}` : "/activity");
  const r = await pool.query(
    `insert into events (type, level, importance, title, body, simulated, job_id, application_id, url, data)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [e.type, level, importance, e.title, e.body ?? null, e.simulated ?? false, e.jobId ?? null,
     e.applicationId ?? null, url, e.data ? JSON.stringify(e.data) : null],
  );
  const id = Number(r.rows[0].id);
  await pool.query(`select pg_notify('events', $1)`, [String(id)]);
  if (e.push !== false) await enqueue("push_event", { eventId: id }, { dedupeKey: `push:${id}`, maxAttempts: 3 });
  return id;
}

export async function setActivity(text: string | null) {
  await pool.query(`update agent_state set current_activity = $1, updated_at = now() where id = 1`, [text]);
}

export async function audit(action: string, detail?: Record<string, unknown>, userId?: string | null, ip?: string | null) {
  await pool.query(`insert into audit_log (action, detail, user_id, ip) values ($1, $2, $3, $4)`,
    [action, detail ? JSON.stringify(detail) : null, userId ?? null, ip ?? null]);
}
