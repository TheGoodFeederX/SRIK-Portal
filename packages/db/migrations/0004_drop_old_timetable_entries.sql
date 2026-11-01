-- v1.3 Timetable: legacy timetable_entries had no period master, no assignment link and no
-- teacher/Room conflict guards. The table was empty in every environment, so it is replaced
-- by timetable_periods (this migration) + the new timetable_entries (0005).
CREATE TYPE "public"."period_type" AS ENUM('LESSON', 'BREAK', 'ASSEMBLY', 'PRAYER', 'ACTIVITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."school_day" AS ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY');--> statement-breakpoint
CREATE TABLE "timetable_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"period_no" smallint NOT NULL,
	"label" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"type" "period_type" DEFAULT 'LESSON' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "timetable_entries" CASCADE;--> statement-breakpoint
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_periods_year_no_unique" ON "timetable_periods" USING btree ("academic_year_id","period_no");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_periods_year_sort_unique" ON "timetable_periods" USING btree ("academic_year_id","sort_order");