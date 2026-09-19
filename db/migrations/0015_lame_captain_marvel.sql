ALTER TABLE "workspace_memberships" DROP CONSTRAINT IF EXISTS "workspace_memberships_role_check";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_role_check" CHECK ("workspace_memberships"."role" IN ('owner', 'member'));
