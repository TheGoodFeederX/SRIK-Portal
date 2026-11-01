-- v1.4 Examination workflow: exam mutability/audit columns, exam_subject pass mark and
-- uniqueness, mark entry timestamp, and the query indexes used by list/roster screens.
-- Additive only: existing exam rows (none in production) keep their data.
ALTER TABLE "exam_marks" ADD COLUMN "entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD COLUMN "pass_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "exam_marks_student_idx" ON "exam_marks" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_subjects_unique" ON "exam_subjects" USING btree ("exam_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX "exam_subjects_exam_idx" ON "exam_subjects" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exam_subjects_class_idx" ON "exam_subjects" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "exam_subjects_subject_idx" ON "exam_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "exams_year_idx" ON "exams" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "exams_status_idx" ON "exams" USING btree ("status");