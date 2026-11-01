-- Stage B: destructive removal of the legacy custom authentication schema.
-- Approved: docs/releases/v1.1-PROD/STAGE_B_APPROVAL.md (2026-11-01).
-- Managed Better Auth owns credentials and sessions in neon_auth; nothing reads these.
DELETE FROM "sessions";--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "password_hash";