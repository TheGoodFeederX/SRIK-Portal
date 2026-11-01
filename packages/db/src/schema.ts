import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE']);
export const accountStatusEnum = pgEnum('account_status', ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']);
export const studentStatusEnum = pgEnum('student_status', ['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN']);
export const yearStatusEnum = pgEnum('academic_year_status', ['PLANNED', 'ACTIVE', 'CLOSED']);
export const classStatusEnum = pgEnum('class_status', ['ACTIVE', 'ARCHIVED']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'SICK', 'EXCUSED', 'LATE']);
export const roleEnum = pgEnum('role', ['ADMIN', 'TEACHER']);
export const importTypeEnum = pgEnum('import_type', ['STAFF', 'STUDENTS', 'CLASSES', 'SUBJECTS', 'ENROLLMENTS', 'ASSIGNMENTS']);
export const importStatusEnum = pgEnum('import_status', [
  'UPLOADED',
  'VALIDATING',
  'PREVIEW_READY',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export const importRowStatusEnum = pgEnum('import_row_status', [
  'VALID',
  'WARNING',
  'INVALID',
  'DUPLICATE',
  'CONFLICT',
  'IMPORTED',
  'SKIPPED',
]);

export const schoolDayEnum = pgEnum('school_day', ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']);
export const periodTypeEnum = pgEnum('period_type', ['LESSON', 'BREAK', 'ASSEMBLY', 'PRAYER', 'ACTIVITY', 'OTHER']);
export const examStatusEnum = pgEnum('exam_status', ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']);
export const staffAttendanceStatusEnum = pgEnum('staff_attendance_status', [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'LATE',
]);

// ---------- Identity & Access ----------

// Application identity. authUserId bridges to neon_auth.user.id (Managed Better Auth).
// Stage B: legacy password_hash removed — credentials live in neon_auth.account.
export const profiles = pgTable('profiles', {
  id: id(),
  authUserId: text('auth_user_id').unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  status: accountStatusEnum('status').notNull().default('INVITED'),
  // Forced first-login password change (spec v1.1-PROD-R2 §9).
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED']);

// An invitation bootstraps application access, never an auth session.
export const accountInvitations = pgTable(
  'account_invitations',
  {
    id: id(),
    email: text('email').notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
    intendedRole: roleEnum('intended_role').notNull(),
    staffId: uuid('staff_id'),
    invitedBy: uuid('invited_by').notNull(),
    status: invitationStatusEnum('status').notNull().default('PENDING'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    // One live invitation per normalized email.
    uniqueIndex('account_invitations_pending_email')
      .on(t.email)
      .where(sql`status = 'PENDING'`),
    index('account_invitations_email_idx').on(t.email),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.role] })],
);

export const loginAudit = pgTable('login_audit', {
  id: id(),
  email: text('email').notNull(),
  success: boolean('success').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: created(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    requestId: text('request_id'),
    createdAt: created(),
  },
  (t) => [index('audit_log_resource_idx').on(t.resourceType, t.resourceId)],
);

// ---------- Staff ----------

export const staff = pgTable('staff', {
  id: id(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  staffNo: text('staff_no').notNull().unique(),
  fullName: text('full_name').notNull(),
  icNo: text('ic_no'),
  gender: genderEnum('gender'),
  dateOfBirth: date('date_of_birth'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  employmentType: text('employment_type').notNull().default('PERMANENT'),
  employmentStatus: text('employment_status').notNull().default('ACTIVE'),
  joinDate: date('join_date').notNull(),
  endDate: date('end_date'),
  createdAt: created(),
  updatedAt: updated(),
});

export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    attendanceDate: date('attendance_date').notNull(),
    status: staffAttendanceStatusEnum('status').notNull(),
    checkIn: timestamp('check_in', { withTimezone: true }),
    checkOut: timestamp('check_out', { withTimezone: true }),
    notes: text('notes'),
    recordedBy: uuid('recorded_by'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('staff_attendance_unique').on(t.staffId, t.attendanceDate)],
);

// ---------- Students & Guardians ----------

export const students = pgTable('students', {
  id: id(),
  studentNo: text('student_no').notNull().unique(),
  fullName: text('full_name').notNull(),
  icNo: text('ic_no'),
  birthCertificateNo: text('birth_certificate_no'),
  gender: genderEnum('gender').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  birthPlace: text('birth_place'),
  status: studentStatusEnum('status').notNull().default('ACTIVE'),
  enrollmentDate: date('enrollment_date').notNull(),
  exitDate: date('exit_date'),
  createdAt: created(),
  updatedAt: updated(),
});

export const guardians = pgTable('guardians', {
  id: id(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  icNo: text('ic_no'),
  phone: text('phone').notNull(),
  email: text('email'),
  occupation: text('occupation'),
  address: text('address'),
  createdAt: created(),
  updatedAt: updated(),
});

export const studentGuardians = pgTable(
  'student_guardians',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    relationship: text('relationship').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    isEmergencyContact: boolean('is_emergency_contact').notNull().default(false),
    canReceiveResults: boolean('can_receive_results').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] })],
);

// ---------- Academic ----------

export const academicYears = pgTable('academic_years', {
  id: id(),
  name: text('name').notNull().unique(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  status: yearStatusEnum('status').notNull().default('PLANNED'),
});

// ponytail: single current year enforced by partial unique index (see migration SQL), no app-only rule.
export const classes = pgTable(
  'classes',
  {
    id: id(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    yearLevel: smallint('year_level').notNull(),
    name: text('name').notNull(),
    classTeacherId: uuid('class_teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    status: classStatusEnum('status').notNull().default('ACTIVE'),
  },
  (t) => [
    uniqueIndex('classes_year_name_unique').on(t.academicYearId, t.name),
    index('classes_year_idx').on(t.academicYearId),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    enrolledAt: date('enrolled_at').notNull(),
    leftAt: date('left_at'),
    status: enrollmentStatusEnum('status').notNull().default('ACTIVE'),
  },
  (t) => [
    uniqueIndex('enrollments_student_year_unique').on(t.studentId, t.academicYearId),
    // v1.2 §49 index review: scope + class roster queries filter on these.
    index('enrollments_class_idx').on(t.classId),
    index('enrollments_year_idx').on(t.academicYearId),
  ],
);

export const subjects = pgTable('subjects', {
  id: id(),
  code: text('code').notNull().unique(),
  nameMs: text('name_ms').notNull(),
  nameEn: text('name_en'),
  isActive: boolean('is_active').notNull().default(true),
});

export const teachingAssignments = pgTable(
  'teaching_assignments',
  {
    id: id(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    uniqueIndex('teaching_assignments_unique').on(t.academicYearId, t.teacherId, t.classId, t.subjectId),
    // v1.2 §49: teacher scope and assignment filters.
    index('teaching_assignments_teacher_idx').on(t.teacherId),
    index('teaching_assignments_class_idx').on(t.classId),
    index('teaching_assignments_subject_idx').on(t.subjectId),
  ],
);

// Period master per academic year (spec v1.3 §8–§9).
export const timetablePeriods = pgTable(
  'timetable_periods',
  {
    id: id(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    periodNo: smallint('period_no').notNull(),
    label: text('label').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    type: periodTypeEnum('type').notNull().default('LESSON'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: smallint('sort_order').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('timetable_periods_year_no_unique').on(t.academicYearId, t.periodNo),
    uniqueIndex('timetable_periods_year_sort_unique').on(t.academicYearId, t.sortOrder),
  ],
);

/**
 * Timetable entry (spec v1.3 §10–§16).
 * LESSON rows carry teaching_assignment_id; teacher/class/subject are denormalized for
 * querying and are validated against the assignment by the service layer.
 * Conflict guards are DB constraints, not only application checks.
 */
export const timetableEntries = pgTable(
  'timetable_entries',
  {
    id: id(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => timetablePeriods.id, { onDelete: 'restrict' }),
    dayOfWeek: schoolDayEnum('day_of_week').notNull(),
    teachingAssignmentId: uuid('teaching_assignment_id').references(() => teachingAssignments.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'restrict' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'restrict' }),
    entryType: periodTypeEnum('entry_type').notNull().default('LESSON'),
    label: text('label'),
    room: text('room'),
    notes: text('notes'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    // Class cannot be double-booked in the same slot.
    uniqueIndex('timetable_class_slot_unique').on(t.academicYearId, t.classId, t.dayOfWeek, t.periodId),
    // Teacher cannot teach two classes in the same slot.
    uniqueIndex('timetable_teacher_slot_unique')
      .on(t.academicYearId, t.teacherId, t.dayOfWeek, t.periodId)
      .where(sql`teacher_id IS NOT NULL`),
    // Room cannot be booked twice in the same slot (optional in MVP, enforced when used).
    uniqueIndex('timetable_room_slot_unique')
      .on(t.academicYearId, t.room, t.dayOfWeek, t.periodId)
      .where(sql`room IS NOT NULL AND room <> ''`),
  ],
);

// ---------- Attendance ----------

export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    attendanceDate: date('attendance_date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    reason: text('reason'),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('student_attendance_unique').on(t.studentId, t.attendanceDate)],
);

// ---------- Examination ----------

// Examination (spec v1.4). Lifecycle: DRAFT → REVIEW → APPROVED → PUBLISHED (terminal).
export const exams = pgTable(
  'exams',
  {
    id: id(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    term: text('term'),
    examType: text('exam_type').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: examStatusEnum('status').notNull().default('DRAFT'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('exams_year_idx').on(t.academicYearId), index('exams_status_idx').on(t.status)],
);

export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: id(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }).notNull().default('100'),
    passScore: numeric('pass_score', { precision: 6, scale: 2 }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('exam_subjects_unique').on(t.examId, t.classId, t.subjectId),
    index('exam_subjects_exam_idx').on(t.examId),
    index('exam_subjects_class_idx').on(t.classId),
    index('exam_subjects_subject_idx').on(t.subjectId),
  ],
);

export const examMarks = pgTable(
  'exam_marks',
  {
    id: id(),
    examSubjectId: uuid('exam_subject_id')
      .notNull()
      .references(() => examSubjects.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    grade: text('grade'),
    remarks: text('remarks'),
    enteredBy: uuid('entered_by'),
    enteredAt: timestamp('entered_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
    approvedBy: uuid('approved_by'),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('exam_marks_unique').on(t.examSubjectId, t.studentId),
    index('exam_marks_student_idx').on(t.studentId),
  ],
);

// ---------- Data onboarding (v1.4.1) ----------

/** One spreadsheet upload = one import session, previewed then committed atomically. */
export const importSessions = pgTable(
  'import_sessions',
  {
    id: id(),
    type: importTypeEnum('type').notNull(),
    filename: text('filename').notNull(),
    status: importStatusEnum('status').notNull().default('UPLOADED'),
    uploadedBy: uuid('uploaded_by').notNull(),
    rowCount: integer('row_count').default(0).notNull(),
    validCount: integer('valid_count').default(0).notNull(),
    invalidCount: integer('invalid_count').default(0).notNull(),
    warningCount: integer('warning_count').default(0).notNull(),
    summary: jsonb('summary'),
    createdAt: created(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (t) => [index('import_sessions_type_idx').on(t.type), index('import_sessions_status_idx').on(t.status), index('import_sessions_created_idx').on(t.createdAt)],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: id(),
    importSessionId: uuid('import_session_id')
      .notNull()
      .references(() => importSessions.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rawData: jsonb('raw_data').notNull(),
    normalizedData: jsonb('normalized_data'),
    status: importRowStatusEnum('status').notNull(),
    errors: jsonb('errors'),
    warnings: jsonb('warnings'),
    resolvedEntityId: uuid('resolved_entity_id'),
    resolution: text('resolution'),
    createdAt: created(),
  },
  (t) => [index('import_rows_session_idx').on(t.importSessionId), index('import_rows_status_idx').on(t.status)],
);
