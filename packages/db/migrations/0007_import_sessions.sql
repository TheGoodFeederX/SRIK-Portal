CREATE TYPE "public"."import_row_status" AS ENUM('VALID', 'WARNING', 'INVALID', 'DUPLICATE', 'CONFLICT', 'IMPORTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."import_type" AS ENUM('STAFF', 'STUDENTS', 'CLASSES', 'SUBJECTS', 'ENROLLMENTS', 'ASSIGNMENTS');--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_session_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"normalized_data" jsonb,
	"status" "import_row_status" NOT NULL,
	"errors" jsonb,
	"warnings" jsonb,
	"resolved_entity_id" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "import_type" NOT NULL,
	"filename" text NOT NULL,
	"status" "import_status" DEFAULT 'UPLOADED' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_session_id_import_sessions_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_rows_session_idx" ON "import_rows" USING btree ("import_session_id");--> statement-breakpoint
CREATE INDEX "import_rows_status_idx" ON "import_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_sessions_type_idx" ON "import_sessions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "import_sessions_status_idx" ON "import_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_sessions_created_idx" ON "import_sessions" USING btree ("created_at");