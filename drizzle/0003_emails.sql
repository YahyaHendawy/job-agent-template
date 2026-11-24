CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"uid" integer,
	"from_name" text,
	"from_address" text,
	"subject" text,
	"received_at" timestamp with time zone,
	"category" text NOT NULL,
	"application_id" uuid,
	"snippet" text,
	"link" text,
	"needs_action" boolean DEFAULT false NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_received" ON "emails" USING btree ("received_at");