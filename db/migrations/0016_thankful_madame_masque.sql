ALTER TABLE "headlong_events" ADD COLUMN "run_id" text;--> statement-breakpoint
CREATE INDEX "headlong_events_run_idx" ON "headlong_events" USING btree ("run_id");