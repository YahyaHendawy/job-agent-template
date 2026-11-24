import {
  pgTable, text, integer, boolean, timestamp, jsonb, uuid, bigserial, index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: now(),
});

export const sessions = pgTable("sessions", {
  id: text().primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  ip: text(),
  createdAt: now(),
  lastSeenAt: now(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** Single-row table holding the agent's control state. */
export const agentState = pgTable("agent_state", {
  id: integer().primaryKey().default(1),
  status: text().notNull().default("running"), // running | paused
  emergencyStop: boolean("emergency_stop").notNull().default(false),
  currentActivity: text("current_activity"),
  workerHeartbeatAt: timestamp("worker_heartbeat_at", { withTimezone: true }),
  workerId: text("worker_id"),
  lastCycleAt: timestamp("last_cycle_at", { withTimezone: true }),
  updatedAt: now(),
});

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: now(),
});

export const profile = pgTable("profile", {
  id: integer().primaryKey().default(1),
  data: jsonb().notNull(),
  cvText: text("cv_text"),
  cvFilename: text("cv_filename"),
  updatedAt: now(),
});

export const sources = pgTable("sources", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().notNull(), // greenhouse | lever | smartrecruiters | ashby | workday | reed | adzuna
  token: text().notNull(), // board token / company id / search key
  employer: text().notNull(),
  sector: text(),
  enabled: boolean().notNull().default(true),
  config: jsonb().notNull().default({}),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastJobCount: integer("last_job_count"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: now(),
}, (t) => [uniqueIndex("sources_kind_token").on(t.kind, t.token)]);

export const jobs = pgTable("jobs", {
  id: uuid().primaryKey().defaultRandom(),
  fingerprint: text().notNull().unique(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  externalId: text("external_id"),
  employer: text().notNull(),
  title: text().notNull(),
  location: text(),
  country: text(), // UK | QA | EG | other
  category: text(), // summer_internship | placement | part_time | temporary | graduate | research | other
  employmentType: text("employment_type"),
  salary: text(),
  startDate: text("start_date"),
  duration: text(),
  deadline: timestamp({ withTimezone: true }),
  applicationUrl: text("application_url"),
  sourceUrl: text("source_url"),
  description: text(),
  listingStatus: text("listing_status").notNull().default("open"), // open | closed | unverified
  discoveredAt: now(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  eligibility: text().notNull().default("manual_verification"), // eligible | potentially_eligible | ineligible | manual_verification
  eligibilityReasons: jsonb("eligibility_reasons").notNull().default([]),
  missingEvidence: jsonb("missing_evidence").notNull().default([]),
  matchScore: integer("match_score").notNull().default(0),
  matchReasons: jsonb("match_reasons").notNull().default([]),
  relevant: boolean().notNull().default(true),
  starred: boolean().notNull().default(false),
  dismissed: boolean().notNull().default(false),
  notes: text(),
  raw: jsonb(),
  updatedAt: now(),
}, (t) => [
  index("jobs_score").on(t.matchScore),
  index("jobs_status").on(t.listingStatus),
  index("jobs_discovered").on(t.discoveredAt),
]);

export const applications = pgTable("applications", {
  id: uuid().primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }).unique(), // one application per job
  status: text().notNull().default("draft"),
  // draft | preparing | awaiting_approval | approved | submitting | submitted | assessment | interview | offer | rejected | withdrawn | failed
  cvMarkdown: text("cv_markdown"),
  coverLetter: text("cover_letter"),
  answers: jsonb().notNull().default([]),
  missingInfo: jsonb("missing_info").notNull().default([]),
  claimCheck: jsonb("claim_check").notNull().default([]),
  autoPrepared: boolean("auto_prepared").notNull().default(false),
  written: jsonb().notNull().default([]),        // [{ key, question, answer, updatedAt }] — written by the owner in the app
  formQuestions: jsonb("form_questions").notNull().default([]), // personal questions the extension found on the real form
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submissionEvidence: jsonb("submission_evidence"),
  notes: text(),
  createdAt: now(),
  updatedAt: now(),
});

export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  type: text().notNull(),
  payload: jsonb().notNull().default({}),
  status: text().notNull().default("queued"), // queued | running | done | failed | cancelled
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer().notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(4),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lastError: text("last_error"),
  dedupeKey: text("dedupe_key"),
  createdAt: now(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("tasks_claim").on(t.status, t.runAt),
  uniqueIndex("tasks_dedupe").on(t.dedupeKey).where(sql`dedupe_key is not null`),
]);

export const events = pgTable("events", {
  id: bigserial({ mode: "number" }).primaryKey(),
  ts: now(),
  type: text().notNull(),
  level: text().notNull().default("info"), // info | success | warning | error
  importance: text().notNull().default("all"), // all | important | urgent
  title: text().notNull(),
  body: text(),
  simulated: boolean().notNull().default(false),
  jobId: uuid("job_id"),
  applicationId: uuid("application_id"),
  url: text(),
  data: jsonb(),
}, (t) => [index("events_ts").on(t.ts)]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  userAgent: text("user_agent"),
  label: text(),
  createdAt: now(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  failures: integer().notNull().default(0),
});

export const pushDeliveries = pgTable("push_deliveries", {
  eventId: integer("event_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  sentAt: now(),
  status: text().notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.subscriptionId] })]);

export const auditLog = pgTable("audit_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  ts: now(),
  userId: uuid("user_id"),
  action: text().notNull(),
  detail: jsonb(),
  ip: text(),
});

export const answerBank = pgTable("answer_bank", {
  id: uuid().primaryKey().defaultRandom(),
  question: text().notNull(),
  answer: text().notNull(),
  verified: boolean().notNull().default(false),
  tags: jsonb().notNull().default([]),
  updatedAt: now(),
});

/** Personal access tokens for the browser autofill extension (only the SHA-256 is stored). */
export const apiTokens = pgTable("api_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text().notNull(),
  createdAt: now(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** Job-inbox emails the watcher has classified (snippet only; full emails stay in Gmail). */
export const emails = pgTable("emails", {
  id: uuid().primaryKey().defaultRandom(),
  messageId: text("message_id").notNull().unique(),
  uid: integer(),
  fromName: text("from_name"),
  fromAddress: text("from_address"),
  subject: text(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  category: text().notNull(), // interview | assessment | rejection | offer | received | verification | recruiter | other
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  snippet: text(),
  link: text(),
  needsAction: boolean("needs_action").notNull().default(false),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("emails_received").on(t.receivedAt)]);
