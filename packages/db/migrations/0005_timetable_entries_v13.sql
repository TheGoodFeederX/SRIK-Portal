CREATE TABLE "timetable_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"day_of_week" "school_day" NOT NULL,
	"teaching_assignment_id" uuid,
	"teacher_id" uuid,
	"subject_id" uuid,
	"entry_type" "period_type" DEFAULT 'LESSON' NOT NULL,
	"label" text,
	"room" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_period_id_timetable_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."timetable_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teaching_assignment_id_teaching_assignments_id_fk" FOREIGN KEY ("teaching_assignment_id") REFERENCES "public"."teaching_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_class_slot_unique" ON "timetable_entries" USING btree ("academic_year_id","class_id","day_of_week","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_teacher_slot_unique" ON "timetable_entries" USING btree ("academic_year_id","teacher_id","day_of_week","period_id") WHERE teacher_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_room_slot_unique" ON "timetable_entries" USING btree ("academic_year_id","room","day_of_week","period_id") WHERE room IS NOT NULL AND room <> '';