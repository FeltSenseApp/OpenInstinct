ALTER TABLE "headlong_minds" ALTER COLUMN "backoff_seconds" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "name" text DEFAULT 'ada' NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "vibe" text DEFAULT 'curious, warm, and plainspoken' NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "focus" text DEFAULT 'learning how their own mind works, and getting to know the people and environment they live with' NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "operator_name" text;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "operator_note" text;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "backoff_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "ticks_at_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "spontaneous_wakes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "goal_review_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "headlong_minds" ADD COLUMN "retrieval_enabled" boolean DEFAULT false NOT NULL;
