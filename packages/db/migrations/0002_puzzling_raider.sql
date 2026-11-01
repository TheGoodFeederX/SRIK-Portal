CREATE TYPE "public"."enrollment_status" AS ENUM('ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."enrollment_status";--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "status" SET DATA TYPE "public"."enrollment_status" USING "status"::"public"."enrollment_status";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "classes_year_idx" ON "classes" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "enrollments_year_idx" ON "enrollments" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_teacher_idx" ON "teaching_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_class_idx" ON "teaching_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_subject_idx" ON "teaching_assignments" USING btree ("subject_id");