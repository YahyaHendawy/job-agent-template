ALTER TABLE "applications" ADD COLUMN "written" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "form_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;