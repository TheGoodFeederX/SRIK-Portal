import {
  boolean,
  date,
  index,
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
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'SICK', 'EXCUSED', 'LATE']);
export const roleEnum = pgEnum('role', ['ADMIN', 'TEACHER']);
export const examStatusEnum = pgEnum('exam_status', ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']);
export const staffAttendanceStatusEnum = pgEnum('staff_attendance_status', [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'LATE',
]);

// ---------- Identity & Access ----------

export const profiles = pgTable('profiles', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: created(),
  updatedAt: updated(),
});

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

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
});

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
  (t) => [uniqueIndex('classes_year_name_unique').on(t.academicYearId, t.name)],
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
    status: text('status').notNull().default('ACTIVE'),
  },
  (t) => [uniqueIndex('enrollments_student_year_unique').on(t.studentId, t.academicYearId)],
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
  ],
);

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
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'restrict' }),
    dayOfWeek: smallint('day_of_week').notNull(),
    periodNo: smallint('period_no').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    room: text('room'),
  },
  (t) => [uniqueIndex('timetable_class_slot_unique').on(t.classId, t.dayOfWeek, t.periodNo)],
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

export const exams = pgTable('exams', {
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
  createdBy: uuid('created_by'),
  createdAt: created(),
});

export const examSubjects = pgTable('exam_subjects', {
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
});

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
    reviewedBy: uuid('reviewed_by'),
    approvedBy: uuid('approved_by'),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('exam_marks_unique').on(t.examSubjectId, t.studentId)],
);
