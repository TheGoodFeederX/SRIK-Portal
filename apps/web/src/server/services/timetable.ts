import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { constraintName, isUniqueViolation } from '../db-errors.ts';
import {
  academicYears,
  classes,
  staff,
  subjects,
  teachingAssignments,
  timetableEntries,
  timetablePeriods,
  type Db,
} from '@srik/db';

/**
 * Timetable domain service (spec v1.3 §42).
 * Every write validates the teaching assignment first, then class/teacher/room conflicts,
 * and lets the DB unique indexes be the final race guard (§44).
 */

export const SCHOOL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'] as const;
export type SchoolDay = (typeof SCHOOL_DAYS)[number];

export type EntryInput = {
  academicYearId: string;
  classId: string;
  periodId: string;
  dayOfWeek: SchoolDay;
  teachingAssignmentId?: string | null;
  entryType: 'LESSON' | 'BREAK' | 'ASSEMBLY' | 'PRAYER' | 'ACTIVITY' | 'OTHER';
  room?: string | null;
  label?: string | null;
  notes?: string | null;
};

const conflict = (code: string, message: string, details: Record<string, unknown>) =>
  new HTTPException(409, { message, cause: { code, details } });

async function requireYearMutable(db: Db, academicYearId: string) {
  const [year] = await db
    .select({ id: academicYears.id, status: academicYears.status })
    .from(academicYears)
    .where(eq(academicYears.id, academicYearId))
    .limit(1);
  if (!year) throw new HTTPException(404, { message: 'Tahun akademik tidak dijumpai.', cause: { code: 'TIMETABLE_PERIOD_YEAR_MISMATCH' } });
  if (year.status === 'CLOSED') {
    throw new HTTPException(409, { message: 'Tahun akademik telah ditutup.', cause: { code: 'TIMETABLE_YEAR_CLOSED' } });
  }
}

async function requirePeriodInYear(db: Db, periodId: string, academicYearId: string) {
  const [period] = await db
    .select({ id: timetablePeriods.id, academicYearId: timetablePeriods.academicYearId, type: timetablePeriods.type, isActive: timetablePeriods.isActive })
    .from(timetablePeriods)
    .where(eq(timetablePeriods.id, periodId))
    .limit(1);
  if (!period) throw new HTTPException(404, { message: 'Waktu tidak dijumpai.', cause: { code: 'TIMETABLE_PERIOD_NOT_FOUND' } });
  if (period.academicYearId !== academicYearId) {
    throw new HTTPException(409, { message: 'Waktu bukan dalam tahun akademik ini.', cause: { code: 'TIMETABLE_PERIOD_YEAR_MISMATCH' } });
  }
  return period;
}

async function requireClassInYear(db: Db, classId: string, academicYearId: string) {
  const [row] = await db
    .select({ id: classes.id, academicYearId: classes.academicYearId, status: classes.status })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: 'Kelas tidak dijumpai.', cause: { code: 'TIMETABLE_CLASS_YEAR_MISMATCH' } });
  if (row.academicYearId !== academicYearId) {
    throw new HTTPException(409, { message: 'Kelas bukan dalam tahun akademik ini.', cause: { code: 'TIMETABLE_CLASS_YEAR_MISMATCH' } });
  }
  return row;
}

/** Explicit search-path for a conflict slot; returns the blocking entry when found. */
async function findSlotConflict(
  db: Db,
  where: SQL | undefined,
  excludeId?: string,
): Promise<{ id: string; classId: string; teacherId: string | null } | null> {
  const filters = [where];
  if (excludeId) filters.push(ne(timetableEntries.id, excludeId));
  const [row] = await db
    .select({ id: timetableEntries.id, classId: timetableEntries.classId, teacherId: timetableEntries.teacherId })
    .from(timetableEntries)
    .where(and(...(filters.filter(Boolean) as SQL[])))
    .limit(1);
  return row ?? null;
}

export type ResolvedEntry = {
  academicYearId: string;
  classId: string;
  periodId: string;
  dayOfWeek: SchoolDay;
  teachingAssignmentId: string | null;
  teacherId: string | null;
  subjectId: string | null;
  entryType: EntryInput['entryType'];
  room: string | null;
  label: string | null;
  notes: string | null;
};

/**
 * Validates a create/update payload against the academic foundation and the conflict engine
 * (§11–§18). Returns the row to persist, with denormalized teacher/subject derived from the
 * assignment.
 */
export async function validateTimetableEntry(db: Db, input: EntryInput, excludeId?: string): Promise<ResolvedEntry> {
  await requireYearMutable(db, input.academicYearId);
  const period = await requirePeriodInYear(db, input.periodId, input.academicYearId);
  const classRow = await requireClassInYear(db, input.classId, input.academicYearId);
  if (classRow.status === 'ARCHIVED') {
    throw new HTTPException(409, { message: 'Kelas telah diarkibkan.', cause: { code: 'TIMETABLE_CLASS_YEAR_MISMATCH' } });
  }

  const isLesson = input.entryType === 'LESSON';
  let teacherId: string | null = null;
  let subjectId: string | null = null;
  let assignmentId: string | null = null;

  if (isLesson) {
    if (!input.teachingAssignmentId) {
      throw new HTTPException(400, { message: 'Agihan pengajaran diperlukan untuk waktu pelajaran.', cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' } });
    }
    if (period.type !== 'LESSON') {
      throw new HTTPException(409, { message: 'Waktu ini bukan waktu pelajaran.', cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' } });
    }
    const [assignment] = await db
      .select()
      .from(teachingAssignments)
      .where(eq(teachingAssignments.id, input.teachingAssignmentId))
      .limit(1);
    if (!assignment) {
      throw new HTTPException(404, { message: 'Agihan pengajaran tidak dijumpai.', cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' } });
    }
    if (assignment.academicYearId !== input.academicYearId || assignment.classId !== input.classId) {
      // The assignment must belong to this class *and* year (§13).
      throw new HTTPException(409, {
        message: 'Agihan pengajaran tidak sepadan dengan kelas atau tahun ini.',
        cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' },
      });
    }
    const [subject] = await db.select({ isActive: subjects.isActive }).from(subjects).where(eq(subjects.id, assignment.subjectId)).limit(1);
    if (!subject?.isActive) {
      throw new HTTPException(409, { message: 'Mata pelajaran tidak aktif.', cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' } });
    }
    const [teacher] = await db.select({ status: staff.employmentStatus }).from(staff).where(eq(staff.id, assignment.teacherId)).limit(1);
    if (teacher?.status !== 'ACTIVE') {
      throw new HTTPException(409, { message: 'Guru tidak aktif.', cause: { code: 'TIMETABLE_INVALID_ASSIGNMENT' } });
    }
    assignmentId = assignment.id;
    teacherId = assignment.teacherId;
    subjectId = assignment.subjectId;
  }

  const slot = (column: typeof timetableEntries.classId | typeof timetableEntries.teacherId | typeof timetableEntries.room, value: string | null) =>
    value === null
      ? undefined
      : and(
          eq(timetableEntries.academicYearId, input.academicYearId),
          eq(column, value),
          eq(timetableEntries.dayOfWeek, input.dayOfWeek),
          eq(timetableEntries.periodId, input.periodId),
        );

  // 1. class conflict
  const classConflict = await findSlotConflict(db, slot(timetableEntries.classId, input.classId), excludeId);
  if (classConflict) {
    throw conflict('TIMETABLE_CLASS_CONFLICT', 'Kelas ini sudah mempunyai jadual pada waktu tersebut.', {
      existingEntryId: classConflict.id,
      classId: input.classId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
    });
  }

  // 2. teacher conflict
  const teacherConflict = teacherId ? await findSlotConflict(db, slot(timetableEntries.teacherId, teacherId), excludeId) : null;
  if (teacherConflict) {
    throw conflict('TIMETABLE_TEACHER_CONFLICT', 'Guru sudah mengajar kelas lain pada waktu tersebut.', {
      existingEntryId: teacherConflict.id,
      teacherId,
      classId: teacherConflict.classId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
    });
  }

  // 3. room conflict
  const room = input.room?.trim() ? input.room.trim() : null;
  const roomConflict = room ? await findSlotConflict(db, slot(timetableEntries.room, room), excludeId) : null;
  if (roomConflict) {
    throw conflict('TIMETABLE_ROOM_CONFLICT', 'Bilik sedang digunakan pada waktu tersebut.', {
      existingEntryId: roomConflict.id,
      room,
      classId: roomConflict.classId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
    });
  }

  return {
    academicYearId: input.academicYearId,
    classId: input.classId,
    periodId: input.periodId,
    dayOfWeek: input.dayOfWeek,
    teachingAssignmentId: assignmentId,
    teacherId,
    subjectId,
    entryType: input.entryType,
    room,
    label: input.label?.trim() || (isLesson ? null : 'Aktiviti'),
    notes: input.notes?.trim() || null,
  };
}

/** Maps a Postgres unique violation to the specific conflict code (§44). */
export function mapUniqueViolationToConflict(error: unknown): never | null {
  if (!isUniqueViolation(error)) return null;
  const constraint = constraintName(error);
  if (constraint.includes('teacher')) {
    throw conflict('TIMETABLE_TEACHER_CONFLICT', 'Guru sudah mengajar kelas lain pada waktu tersebut.', { constraint });
  }
  if (constraint.includes('room')) {
    throw conflict('TIMETABLE_ROOM_CONFLICT', 'Bilik sedang digunakan pada waktu tersebut.', { constraint });
  }
  throw conflict('TIMETABLE_CLASS_CONFLICT', 'Kelas ini sudah mempunyai jadual pada waktu tersebut.', { constraint });
}

/* ------------------------------- reads ------------------------------- */

export async function listPeriods(db: Db, academicYearId: string) {
  return db
    .select()
    .from(timetablePeriods)
    .where(eq(timetablePeriods.academicYearId, academicYearId))
    .orderBy(asc(timetablePeriods.sortOrder));
}

export async function listEntries(
  db: Db,
  filters: { academicYearId: string; classId?: string; teacherId?: string; subjectId?: string; dayOfWeek?: SchoolDay; periodId?: string; classIds?: string[] },
) {
  const parts: SQL[] = [eq(timetableEntries.academicYearId, filters.academicYearId)];
  if (filters.classId) parts.push(eq(timetableEntries.classId, filters.classId));
  if (filters.classIds) {
    if (filters.classIds.length === 0) return [];
    parts.push(inArray(timetableEntries.classId, filters.classIds));
  }
  if (filters.teacherId) parts.push(eq(timetableEntries.teacherId, filters.teacherId));
  if (filters.subjectId) parts.push(eq(timetableEntries.subjectId, filters.subjectId));
  if (filters.dayOfWeek) parts.push(eq(timetableEntries.dayOfWeek, filters.dayOfWeek));
  if (filters.periodId) parts.push(eq(timetableEntries.periodId, filters.periodId));

  return db
    .select({
      id: timetableEntries.id,
      academicYearId: timetableEntries.academicYearId,
      classId: timetableEntries.classId,
      className: classes.name,
      periodId: timetableEntries.periodId,
      dayOfWeek: timetableEntries.dayOfWeek,
      teachingAssignmentId: timetableEntries.teachingAssignmentId,
      teacherId: timetableEntries.teacherId,
      teacherName: staff.fullName,
      subjectId: timetableEntries.subjectId,
      subjectCode: subjects.code,
      subjectName: subjects.nameMs,
      entryType: timetableEntries.entryType,
      label: timetableEntries.label,
      room: timetableEntries.room,
      notes: timetableEntries.notes,
    })
    .from(timetableEntries)
    .innerJoin(classes, eq(classes.id, timetableEntries.classId))
    .leftJoin(staff, eq(staff.id, timetableEntries.teacherId))
    .leftJoin(subjects, eq(subjects.id, timetableEntries.subjectId))
    .where(and(...parts))
    .orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.periodId));
}

/** Assignment picker source: assignments that still have no entry in this slot (§34). */
export async function assignmentOptions(db: Db, academicYearId: string, classId: string) {
  return db
    .select({
      id: teachingAssignments.id,
      teacherId: teachingAssignments.teacherId,
      teacherName: staff.fullName,
      subjectId: teachingAssignments.subjectId,
      subjectCode: subjects.code,
      subjectName: subjects.nameMs,
      isPrimary: teachingAssignments.isPrimary,
    })
    .from(teachingAssignments)
    .innerJoin(staff, eq(staff.id, teachingAssignments.teacherId))
    .innerJoin(subjects, eq(subjects.id, teachingAssignments.subjectId))
    .where(
      and(
        eq(teachingAssignments.academicYearId, academicYearId),
        eq(teachingAssignments.classId, classId),
        eq(subjects.isActive, true),
        eq(staff.employmentStatus, 'ACTIVE'),
      ),
    )
    .orderBy(asc(subjects.code));
}

export async function countTimetableReferences(db: Db, assignmentId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(timetableEntries)
    .where(eq(timetableEntries.teachingAssignmentId, assignmentId));
  return Number(row?.total ?? 0);
}

export async function timetableSummary(db: Db, academicYearId: string) {
  const [entries] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(timetableEntries)
    .where(eq(timetableEntries.academicYearId, academicYearId));
  const [teachers] = await db
    .select({ total: sql<number>`count(distinct ${timetableEntries.teacherId})::int` })
    .from(timetableEntries)
    .where(eq(timetableEntries.academicYearId, academicYearId));
  const [classesScheduled] = await db
    .select({ total: sql<number>`count(distinct ${timetableEntries.classId})::int` })
    .from(timetableEntries)
    .where(eq(timetableEntries.academicYearId, academicYearId));
  const [unscheduled] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(teachingAssignments)
    .where(
      and(
        eq(teachingAssignments.academicYearId, academicYearId),
        sql`not exists (select 1 from timetable_entries te where te.teaching_assignment_id = ${teachingAssignments.id})`,
      ),
    );

  return {
    timetableEntries: Number(entries?.total ?? 0),
    teachersScheduled: Number(teachers?.total ?? 0),
    classesScheduled: Number(classesScheduled?.total ?? 0),
    unscheduledAssignments: Number(unscheduled?.total ?? 0),
  };
}
