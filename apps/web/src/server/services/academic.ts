import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { academicYears, classes, enrollments, staff, students, subjects, teachingAssignments, type Db } from '@srik/db';

/**
 * Academic master-data services (spec v1.2 §50). Validation lives here so routes stay thin and
 * domain rules (year mutability, class/year consistency, active subject) are enforced once.
 */

export const academicYearStatus = (status: string) => status;

/** Closed years are readable but not mutable (spec v1.2 §52). */
export async function assertYearMutable(db: Db, academicYearId: string): Promise<{ id: string; status: string }> {
  const [year] = await db
    .select({ id: academicYears.id, status: academicYears.status })
    .from(academicYears)
    .where(eq(academicYears.id, academicYearId))
    .limit(1);
  if (!year) throw new HTTPException(404, { message: 'Tahun akademik tidak dijumpai.', cause: { code: 'INVALID_ACADEMIC_YEAR' } });
  if (year.status === 'CLOSED') {
    throw new HTTPException(409, { message: 'Tahun akademik ini telah ditutup dan tidak boleh diubah.', cause: { code: 'ACADEMIC_YEAR_CLOSED' } });
  }
  return year;
}

export async function assertClassInYear(db: Db, classId: string, academicYearId: string) {
  const [row] = await db
    .select({ id: classes.id, academicYearId: classes.academicYearId, status: classes.status })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: 'Kelas tidak dijumpai.', cause: { code: 'INVALID_CLASS' } });
  if (row.academicYearId !== academicYearId) {
    throw new HTTPException(409, { message: 'Kelas bukan dalam tahun akademik yang dipilih.', cause: { code: 'INVALID_CLASS' } });
  }
  return row;
}

export async function assertActiveSubject(db: Db, subjectId: string) {
  const [row] = await db.select({ id: subjects.id, isActive: subjects.isActive, code: subjects.code }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Mata pelajaran tidak dijumpai.', cause: { code: 'INVALID_SUBJECT' } });
  if (!row.isActive) throw new HTTPException(409, { message: 'Mata pelajaran tidak aktif.', cause: { code: 'SUBJECT_INACTIVE' } });
  return row;
}

export async function assertActiveTeacher(db: Db, teacherId: string) {
  const [row] = await db
    .select({ id: staff.id, status: staff.employmentStatus })
    .from(staff)
    .where(eq(staff.id, teacherId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: 'Guru tidak dijumpai.', cause: { code: 'INVALID_TEACHER' } });
  if (row.status !== 'ACTIVE') throw new HTTPException(409, { message: 'Guru tidak aktif.', cause: { code: 'INVALID_TEACHER' } });
  return row;
}

// ---------- Subjects ----------

export function subjectFilters(query: { q?: string; active?: string }): SQL | undefined {
  const parts: SQL[] = [];
  if (query.q) parts.push(or(ilike(subjects.code, `%${query.q}%`), ilike(subjects.nameMs, `%${query.q}%`))!);
  if (query.active === 'true') parts.push(eq(subjects.isActive, true));
  if (query.active === 'false') parts.push(eq(subjects.isActive, false));
  return parts.length ? and(...parts) : undefined;
}

export async function listSubjects(db: Db, where?: SQL) {
  return db.select().from(subjects).where(where).orderBy(asc(subjects.code));
}

// ---------- Teaching assignments ----------

export async function listAssignments(db: Db, filters: { academicYearId?: string; classId?: string; teacherId?: string; subjectId?: string }) {
  const parts: SQL[] = [];
  if (filters.academicYearId) parts.push(eq(teachingAssignments.academicYearId, filters.academicYearId));
  if (filters.classId) parts.push(eq(teachingAssignments.classId, filters.classId));
  if (filters.teacherId) parts.push(eq(teachingAssignments.teacherId, filters.teacherId));
  if (filters.subjectId) parts.push(eq(teachingAssignments.subjectId, filters.subjectId));
  const where = parts.length ? and(...parts) : undefined;

  return db
    .select({
      id: teachingAssignments.id,
      academicYearId: teachingAssignments.academicYearId,
      teacherId: teachingAssignments.teacherId,
      classId: teachingAssignments.classId,
      subjectId: teachingAssignments.subjectId,
      isPrimary: teachingAssignments.isPrimary,
      teacherName: staff.fullName,
      className: classes.name,
      subjectCode: subjects.code,
      subjectName: subjects.nameMs,
    })
    .from(teachingAssignments)
    .innerJoin(staff, eq(staff.id, teachingAssignments.teacherId))
    .innerJoin(classes, eq(classes.id, teachingAssignments.classId))
    .innerJoin(subjects, eq(subjects.id, teachingAssignments.subjectId))
    .where(where)
    .orderBy(asc(classes.name), asc(subjects.code));
}

export async function assertAssignmentUnique(
  db: Db,
  input: { academicYearId: string; teacherId: string; classId: string; subjectId: string },
  excludeId?: string,
) {
  const [row] = await db
    .select({ id: teachingAssignments.id })
    .from(teachingAssignments)
    .where(
      and(
        eq(teachingAssignments.academicYearId, input.academicYearId),
        eq(teachingAssignments.teacherId, input.teacherId),
        eq(teachingAssignments.classId, input.classId),
        eq(teachingAssignments.subjectId, input.subjectId),
      ),
    )
    .limit(1);
  if (row && row.id !== excludeId) {
    throw new HTTPException(409, { message: 'Agihan ini sudah wujud.', cause: { code: 'ASSIGNMENT_EXISTS' } });
  }
}

// ---------- Enrollments ----------

export async function listEnrollments(
  db: Db,
  filters: { academicYearId?: string; classId?: string; status?: string },
  limit = 200,
) {
  const parts: SQL[] = [];
  if (filters.academicYearId) parts.push(eq(enrollments.academicYearId, filters.academicYearId));
  if (filters.classId) parts.push(eq(enrollments.classId, filters.classId));
  if (filters.status) parts.push(eq(enrollments.status, filters.status as 'ACTIVE'));
  const where = parts.length ? and(...parts) : undefined;

  return db
    .select({
      id: enrollments.id,
      studentId: enrollments.studentId,
      studentNo: students.studentNo,
      studentName: students.fullName,
      classId: enrollments.classId,
      className: classes.name,
      academicYearId: enrollments.academicYearId,
      enrolledAt: enrollments.enrolledAt,
      leftAt: enrollments.leftAt,
      status: enrollments.status,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(where)
    .orderBy(asc(classes.name), asc(students.fullName))
    .limit(limit);
}

export async function assertStudentExists(db: Db, studentId: string) {
  const [row] = await db.select({ id: students.id, name: students.fullName }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Murid tidak dijumpai.', cause: { code: 'INVALID_STUDENT' } });
  return row;
}

/** One enrollment per student per academic year (spec v1.2 §13, §17). */
export async function findEnrollment(db: Db, studentId: string, academicYearId: string) {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.academicYearId, academicYearId)))
    .limit(1);
  return row ?? null;
}

export async function classRosterCount(db: Db, classId: string, academicYearId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(and(eq(enrollments.classId, classId), eq(enrollments.academicYearId, academicYearId), eq(enrollments.status, 'ACTIVE')));
  return Number(row?.total ?? 0);
}
