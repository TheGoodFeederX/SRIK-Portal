import { HTTPException } from 'hono/http-exception';
import { inArray } from 'drizzle-orm';
import {
  academicYears,
  classes,
  enrollments,
  staff,
  students,
  subjects,
  teachingAssignments,
  type Db,
} from '@srik/db';
import { normalizeEmail, type ImportType, type RowIssue } from '@srik/shared';

/**
 * Normalisation + per-entity validation for the import pipeline (spec v1.4.1 §19–§20, §50).
 * Validation is read-only: it never mutates domain tables and reuses the same rules the
 * application applies (unique identifiers, year/class consistency, active teacher/subject).
 */

export type RowState = 'VALID' | 'WARNING' | 'INVALID' | 'DUPLICATE' | 'CONFLICT';
export type ValidatedRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  normalized: Record<string, unknown>;
  status: RowState;
  errors: RowIssue[];
  warnings: RowIssue[];
  /** Existing entity matched by the stable business identifier. */
  existingId: string | null;
  resolution?: 'SKIP' | 'REPLACE' | null;
};

const err = (column: string, code: string, message: string): RowIssue => ({ column, code, message, severity: 'ERROR' });
const warn = (column: string, code: string, message: string): RowIssue => ({ column, code, message, severity: 'WARNING' });

export function parseBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (['true', 'ya', 'yes', '1', 'y'].includes(v)) return true;
  if (['false', 'tidak', 'no', '0', 'n'].includes(v)) return false;
  return null;
}

/** Only unambiguous YYYY-MM-DD is accepted (§39). */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

const statusOf = (errors: RowIssue[], warnings: RowIssue[], fallback: RowState): RowState =>
  errors.length ? 'INVALID' : warnings.length ? 'WARNING' : fallback;

const empty = (raw: Record<string, string>): Record<string, unknown> => ({ ...raw });

/* --------------------------------- STAFF --------------------------------- */

export async function validateStaffRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const staffNos = rows.map((r) => r.data.staff_no?.trim()).filter(Boolean) as string[];
  const existing = staffNos.length ? await db.select({ id: staff.id, staffNo: staff.staffNo }).from(staff).where(inArray(staff.staffNo, staffNos)) : [];
  const byNo = new Map(existing.map((e) => [e.staffNo, e.id]));
  const seen = new Set<string>();

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const normalized = empty(data);

    const staffNo = data.staff_no?.trim();
    const fullName = data.full_name?.trim();
    if (!staffNo) errors.push(err('staff_no', 'REQUIRED', 'staff_no wajib.'));
    if (!fullName) errors.push(err('full_name', 'REQUIRED', 'full_name wajib.'));
    const email = data.email_alias?.trim() ? normalizeEmail(data.email_alias.trim()) : null;
    if (email) normalized.email = email;
    const employmentStatus = (data.employment_status || 'ACTIVE').trim().toUpperCase();
    if (!['ACTIVE', 'RESIGNED', 'RETIRED'].includes(employmentStatus)) {
      errors.push(err('employment_status', 'INVALID_VALUE', 'Status pekerjaan tidak sah.'));
    }

    if (staffNo && seen.has(staffNo)) errors.push(err('staff_no', 'IMPORT_DUPLICATE', 'staff_no berulang dalam fail ini.'));
    if (staffNo) seen.add(staffNo);

    const existingId = staffNo ? (byNo.get(staffNo) ?? null) : null;
    if (existingId) {
      return { rowNumber, rawData: data, normalized: { ...normalized, employmentStatus }, status: 'DUPLICATE', errors, warnings, existingId, resolution: 'SKIP' };
    }
    return {
      rowNumber,
      rawData: data,
      normalized: { staffNo, fullName, email, phone: data.phone?.trim() || null, position: data.position?.trim() || null, employmentStatus },
      status: statusOf(errors, warnings, 'VALID'),
      errors,
      warnings,
      existingId: null,
    };
  });
}

/* -------------------------------- STUDENTS ------------------------------- */

export async function validateStudentRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const numbers = rows.map((r) => r.data.student_no?.trim()).filter(Boolean) as string[];
  const existing = numbers.length ? await db.select({ id: students.id, studentNo: students.studentNo }).from(students).where(inArray(students.studentNo, numbers)) : [];
  const byNo = new Map(existing.map((e) => [e.studentNo, e.id]));
  const seen = new Set<string>();

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const studentNo = data.student_no?.trim();
    const fullName = data.full_name?.trim();
    if (!studentNo) errors.push(err('student_no', 'REQUIRED', 'student_no wajib.'));
    if (!fullName) errors.push(err('full_name', 'REQUIRED', 'full_name wajib.'));

    const gender = (data.gender || '').trim().toUpperCase() || null;
    if (gender && !['MALE', 'FEMALE'].includes(gender)) errors.push(err('gender', 'INVALID_VALUE', 'Jantina tidak sah.'));
    const status = (data.status || 'ACTIVE').trim().toUpperCase();
    if (!['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN'].includes(status)) errors.push(err('status', 'INVALID_VALUE', 'Status murid tidak sah.'));
    const dob = data.date_of_birth?.trim() ? parseDate(data.date_of_birth) : null;
    if (data.date_of_birth?.trim() && !dob) errors.push(err('date_of_birth', 'INVALID_DATE', 'Tarikh lahir mesti YYYY-MM-DD.'));

    if (studentNo && seen.has(studentNo)) errors.push(err('student_no', 'IMPORT_DUPLICATE', 'student_no berulang dalam fail ini.'));
    if (studentNo) seen.add(studentNo);

    const existingId = studentNo ? (byNo.get(studentNo) ?? null) : null;
    if (existingId) return { rowNumber, rawData: data, normalized: { studentNo, fullName, gender, status, dob }, status: 'DUPLICATE', errors, warnings, existingId, resolution: 'SKIP' };

    // date_of_birth has no default; import requires it for a NEW student, otherwise INVALID.
    if (!dob) errors.push(err('date_of_birth', 'REQUIRED', 'date_of_birth wajib untuk murid baharu (YYYY-MM-DD).'));
    if (!gender) errors.push(err('gender', 'REQUIRED', 'gender wajib untuk murid baharu.'));

    return {
      rowNumber,
      rawData: data,
      normalized: { studentNo, fullName, gender, status, dateOfBirth: dob },
      status: statusOf(errors, warnings, 'VALID'),
      errors,
      warnings,
      existingId: null,
    };
  });
}

/* --------------------------------- CLASSES -------------------------------- */

export async function validateClassRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const years = await db.select({ id: academicYears.id, name: academicYears.name, status: academicYears.status }).from(academicYears);
  const yearByName = new Map(years.map((y) => [y.name.toLowerCase(), y]));
  const staffRows = await db.select({ id: staff.id, staffNo: staff.staffNo, status: staff.employmentStatus }).from(staff);
  const staffByNo = new Map(staffRows.map((s) => [s.staffNo, s]));
  const classRows = await db.select({ id: classes.id, academicYearId: classes.academicYearId, name: classes.name, yearLevel: classes.yearLevel }).from(classes);
  const classKey = (yearId: string, name: string) => `${yearId}::${name.toLowerCase()}`;
  const classByKey = new Map(classRows.map((c) => [classKey(c.academicYearId, c.name), c.id]));

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const year = yearByName.get((data.academic_year ?? '').trim().toLowerCase());
    if (!year) errors.push(err('academic_year', 'INVALID_ACADEMIC_YEAR', 'Tahun akademik tidak dijumpai.'));
    else if (year.status === 'CLOSED') errors.push(err('academic_year', 'EXAM_YEAR_CLOSED', 'Tahun akademik telah ditutup.'));

    const yearLevel = Number((data.year_level ?? '').trim());
    if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) errors.push(err('year_level', 'INVALID_VALUE', 'year_level mesti 1–6.'));

    const className = (data.class_name ?? '').trim();
    if (!className) errors.push(err('class_name', 'REQUIRED', 'class_name wajib.'));

    let classTeacherId: string | null = null;
    const teacherNo = (data.class_teacher_staff_no ?? '').trim();
    if (teacherNo) {
      const teacher = staffByNo.get(teacherNo);
      if (!teacher) errors.push(err('class_teacher_staff_no', 'INVALID_TEACHER', 'Guru kelas tidak dijumpai.'));
      else if (teacher.status !== 'ACTIVE') errors.push(err('class_teacher_staff_no', 'INVALID_TEACHER', 'Guru kelas tidak aktif.'));
      else classTeacherId = teacher.id;
    }

    const status = (data.status || 'ACTIVE').trim().toUpperCase();
    if (!['ACTIVE', 'ARCHIVED'].includes(status)) errors.push(err('status', 'INVALID_VALUE', 'Status kelas tidak sah.'));

    const existingId = year && className ? (classByKey.get(classKey(year.id, className)) ?? null) : null;
    if (existingId) {
      return { rowNumber, rawData: data, normalized: { className, yearLevel, status }, status: 'DUPLICATE', errors, warnings, existingId, resolution: 'SKIP' };
    }
    return {
      rowNumber,
      rawData: data,
      normalized: { academicYearId: year?.id ?? null, yearLevel, name: className, classTeacherId, status },
      status: statusOf(errors, warnings, 'VALID'),
      errors,
      warnings,
      existingId: null,
    };
  });
}

/* -------------------------------- SUBJECTS -------------------------------- */

export async function validateSubjectRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const codes = rows.map((r) => (r.data.subject_code ?? '').trim().toUpperCase()).filter(Boolean);
  const existing = codes.length ? await db.select({ id: subjects.id, code: subjects.code }).from(subjects).where(inArray(subjects.code, codes)) : [];
  const byCode = new Map(existing.map((e) => [e.code, e.id]));
  const seen = new Set<string>();

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const code = (data.subject_code ?? '').trim().toUpperCase();
    const nameMs = (data.name_ms ?? '').trim();
    if (!code) errors.push(err('subject_code', 'REQUIRED', 'subject_code wajib.'));
    else if (!/^[A-Z0-9._-]+$/.test(code)) errors.push(err('subject_code', 'INVALID_VALUE', 'Kod hanya aksara alfanumerik, titik, sengkang.'));
    if (!nameMs) errors.push(err('name_ms', 'REQUIRED', 'name_ms wajib.'));

    let isActive = true;
    if ((data.is_active ?? '').trim()) {
      const parsed = parseBoolean(data.is_active ?? '');
      if (parsed === null) errors.push(err('is_active', 'INVALID_VALUE', 'is_active mesti TRUE/FALSE.'));
      else isActive = parsed;
    }

    if (code && seen.has(code)) errors.push(err('subject_code', 'IMPORT_DUPLICATE', 'subject_code berulang dalam fail ini.'));
    if (code) seen.add(code);

    const existingId = code ? (byCode.get(code) ?? null) : null;
    if (existingId) return { rowNumber, rawData: data, normalized: { code, nameMs, isActive }, status: 'DUPLICATE', errors, warnings, existingId, resolution: 'SKIP' };

    return {
      rowNumber,
      rawData: data,
      normalized: { code, nameMs, nameEn: (data.name_en ?? '').trim() || null, isActive },
      status: statusOf(errors, warnings, 'VALID'),
      errors,
      warnings,
      existingId: null,
    };
  });
}

/* ------------------------------- ENROLLMENTS ------------------------------ */

export async function validateEnrollmentRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const years = await db.select({ id: academicYears.id, name: academicYears.name, status: academicYears.status }).from(academicYears);
  const yearByName = new Map(years.map((y) => [y.name.toLowerCase(), y]));
  const studentRows = await db.select({ id: students.id, studentNo: students.studentNo }).from(students);
  const studentByNo = new Map(studentRows.map((s) => [s.studentNo, s.id]));
  const classRows = await db.select({ id: classes.id, academicYearId: classes.academicYearId, name: classes.name }).from(classes);
  const classByKey = new Map(classRows.map((c) => [`${c.academicYearId}::${c.name.toLowerCase()}`, c]));
  const enrollmentRows = await db.select({ id: enrollments.id, studentId: enrollments.studentId, classId: enrollments.classId, academicYearId: enrollments.academicYearId }).from(enrollments);
  const enrollmentByStudentYear = new Map(enrollmentRows.map((e) => [`${e.studentId}::${e.academicYearId}`, e]));

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const year = yearByName.get((data.academic_year ?? '').trim().toLowerCase());
    if (!year) errors.push(err('academic_year', 'INVALID_ACADEMIC_YEAR', 'Tahun akademik tidak dijumpai.'));
    const studentId = studentByNo.get((data.student_no ?? '').trim()) ?? null;
    if (!studentId) errors.push(err('student_no', 'INVALID_STUDENT', 'Murid tidak dijumpai.'));
    const className = (data.class_name ?? '').trim();
    const classRow = year && className ? classByKey.get(`${year.id}::${className.toLowerCase()}`) ?? null : null;
    if (!classRow) errors.push(err('class_name', 'INVALID_CLASS', 'Kelas tidak dijumpai dalam tahun tersebut.'));

    const status = (data.status || 'ACTIVE').trim().toUpperCase();
    if (!['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED'].includes(status)) errors.push(err('status', 'INVALID_VALUE', 'Status enrollment tidak sah.'));
    const enrolledAt = data.enrolled_at?.trim() ? parseDate(data.enrolled_at) : null;
    if (data.enrolled_at?.trim() && !enrolledAt) errors.push(err('enrolled_at', 'INVALID_DATE', 'enrolled_at mesti YYYY-MM-DD.'));

    const existing = studentId && year ? enrollmentByStudentYear.get(`${studentId}::${year.id}`) ?? null : null;
    if (existing) {
      const sameClass = existing.classId === classRow?.id;
      // A student already enrolled elsewhere this year is a CONFLICT, never a silent move (§16).
      const state: RowState = sameClass ? 'DUPLICATE' : 'CONFLICT';
      return {
        rowNumber,
        rawData: data,
        normalized: { academicYearId: year?.id ?? null, studentId, classId: classRow?.id ?? null, status, enrolledAt },
        status: state,
        errors,
        warnings,
        existingId: existing.id,
        resolution: 'SKIP',
      };
    }

    return {
      rowNumber,
      rawData: data,
      normalized: { academicYearId: year?.id ?? null, studentId, classId: classRow?.id ?? null, status, enrolledAt },
      status: statusOf(errors, warnings, 'VALID'),
      errors,
      warnings,
      existingId: null,
    };
  });
}

/* ---------------------------- ASSIGNMENTS --------------------------------- */

export async function validateAssignmentRows(db: Db, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  const years = await db.select({ id: academicYears.id, name: academicYears.name, status: academicYears.status }).from(academicYears);
  const yearByName = new Map(years.map((y) => [y.name.toLowerCase(), y]));
  const staffRows = await db.select({ id: staff.id, staffNo: staff.staffNo, status: staff.employmentStatus }).from(staff);
  const staffByNo = new Map(staffRows.map((s) => [s.staffNo, s]));
  const subjectRows = await db.select({ id: subjects.id, code: subjects.code, isActive: subjects.isActive }).from(subjects);
  const subjectByCode = new Map(subjectRows.map((s) => [s.code.toUpperCase(), s]));
  const classRows = await db.select({ id: classes.id, academicYearId: classes.academicYearId, name: classes.name }).from(classes);
  const classByKey = new Map(classRows.map((c) => [`${c.academicYearId}::${c.name.toLowerCase()}`, c]));
  const assignmentRows = await db.select().from(teachingAssignments);
  const key = (yearId: string, teacherId: string, classId: string, subjectId: string) => `${yearId}::${teacherId}::${classId}::${subjectId}`;
  const byKey = new Map(assignmentRows.map((a) => [key(a.academicYearId, a.teacherId, a.classId, a.subjectId), a.id]));

  return rows.map(({ rowNumber, data }) => {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const year = yearByName.get((data.academic_year ?? '').trim().toLowerCase());
    if (!year) errors.push(err('academic_year', 'INVALID_ACADEMIC_YEAR', 'Tahun akademik tidak dijumpai.'));
    const teacher = staffByNo.get((data.teacher_staff_no ?? '').trim());
    if (!teacher) errors.push(err('teacher_staff_no', 'INVALID_TEACHER', 'Guru tidak dijumpai.'));
    else if (teacher.status !== 'ACTIVE') errors.push(err('teacher_staff_no', 'INVALID_TEACHER', 'Guru tidak aktif.'));
    const className = (data.class_name ?? '').trim();
    const classRow = year && className ? classByKey.get(`${year.id}::${className.toLowerCase()}`) ?? null : null;
    if (!classRow) errors.push(err('class_name', 'INVALID_CLASS', 'Kelas tidak dijumpai dalam tahun tersebut.'));
    const subject = subjectByCode.get((data.subject_code ?? '').trim().toUpperCase());
    if (!subject) errors.push(err('subject_code', 'INVALID_SUBJECT', 'Subjek tidak dijumpai.'));
    else if (!subject.isActive) errors.push(err('subject_code', 'SUBJECT_INACTIVE', 'Subjek tidak aktif.'));

    let isPrimary = false;
    if ((data.is_primary ?? '').trim()) {
      const parsed = parseBoolean(data.is_primary ?? '');
      if (parsed === null) errors.push(err('is_primary', 'INVALID_VALUE', 'is_primary mesti TRUE/FALSE.'));
      else isPrimary = parsed;
    }

    const normalized = {
      academicYearId: year?.id ?? null,
      teacherId: teacher?.id ?? null,
      classId: classRow?.id ?? null,
      subjectId: subject?.id ?? null,
      isPrimary,
    };

    if (!errors.length && year && teacher && classRow && subject) {
      const existingId = byKey.get(key(year.id, teacher.id, classRow.id, subject.id)) ?? null;
      if (existingId) {
        return { rowNumber, rawData: data, normalized, status: 'DUPLICATE', errors, warnings, existingId, resolution: 'SKIP' };
      }
    }

    return { rowNumber, rawData: data, normalized, status: statusOf(errors, warnings, 'VALID'), errors, warnings, existingId: null };
  });
}

export async function validateRows(db: Db, type: ImportType, rows: { rowNumber: number; data: Record<string, string> }[]): Promise<ValidatedRow[]> {
  switch (type) {
    case 'STAFF':
      return validateStaffRows(db, rows);
    case 'STUDENTS':
      return validateStudentRows(db, rows);
    case 'CLASSES':
      return validateClassRows(db, rows);
    case 'SUBJECTS':
      return validateSubjectRows(db, rows);
    case 'ENROLLMENTS':
      return validateEnrollmentRows(db, rows);
    case 'ASSIGNMENTS':
      return validateAssignmentRows(db, rows);
    default:
      throw new HTTPException(400, { message: 'Jenis import tidak disokong.', cause: { code: 'IMPORT_TEMPLATE_UNSUPPORTED' } });
  }
}

/** Compact preview counters (§23). */
export function summarise(rows: ValidatedRow[]) {
  const count = (s: RowState) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    valid: count('VALID'),
    warnings: count('WARNING'),
    invalid: count('INVALID'),
    duplicates: count('DUPLICATE'),
    conflicts: count('CONFLICT'),
  };
}
