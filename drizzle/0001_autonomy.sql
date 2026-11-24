ALTER TABLE "applications" ADD COLUMN "auto_prepared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "notified_at" timestamp with time zone;