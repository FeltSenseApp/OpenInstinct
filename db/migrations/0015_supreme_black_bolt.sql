CREATE TABLE "headlong_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"type" text NOT NULL,
	"thinker" text NOT NULL,
	"direction" text DEFAULT 'internal' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"author_user_id" text,
	"eve_session_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "headlong_memories" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "headlong_memories_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "headlong_minds" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"identity" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"backoff_seconds" integer DEFAULT 5 NOT NULL,
	"next_wake_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "headlong_minds_backoff_check" CHECK ("headlong_minds"."backoff_seconds" BETWEEN 0 AND 300)
);
--> statement-breakpoint
CREATE TABLE "headlong_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"trigger_event_id" text NOT NULL,
	"thinker" text NOT NULL,
	"status" text DEFAULT 'dispatching' NOT NULL,
	"eve_session_id" text,
	"error" text,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "headlong_events" ADD CONSTRAINT "headlong_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlong_memories" ADD CONSTRAINT "headlong_memories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD CONSTRAINT "headlong_minds_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlong_runs" ADD CONSTRAINT "headlong_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "headlong_events_trajectory_idx" ON "headlong_events" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "headlong_memories_lookup_idx" ON "headlong_memories" USING btree ("workspace_id","kind","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "headlong_runs_trigger_thinker_key" ON "headlong_runs" USING btree ("workspace_id","trigger_event_id","thinker");--> statement-breakpoint
CREATE INDEX "headlong_runs_workspace_idx" ON "headlong_runs" USING btree ("workspace_id","started_at" DESC NULLS LAST);