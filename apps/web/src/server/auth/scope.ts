import { and, eq, inArray } from 'drizzle-orm';
import { classes, enrollments, profiles, staff, teachingAssignments, type Db } from '@srik/db';
import type { ApplicationUser } from '../types.ts';

/**
 * Single source of teacher record scope (spec v1.2 §20–§21).
 * Every module that filters by class/student must call these helpers instead of writing
 * its own scope SQL.
 *
 * Scope = classes where the teacher is homeroom (classes.class_teacher_id)
 *         OR has a teaching assignment (teaching_assignments.teacher_id).
 */

export type Scope = { unrestricted: true } | { unrestricted: false; classIds: string[] };
export type IdScope = { unrestricted: true } | { unrestricted: false; ids: string[] };

export async function getTeacherClassIds(db: Db, user: ApplicationUser): Promise<Scope> {
  if (user.roles.includes('ADMIN')) return { unrestricted: true };

  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.profileId, user.profileId)).limit(1);
  if (!staffRow) return { unrestricted: false, classIds: [] };

  const teaching = await db
    .select({ classId: teachingAssignments.classId })
    .from(teachingAssignments)
    .where(eq(teachingAssignments.teacherId, staffRow.id));
  const homeroom = await db.select({ classId: classes.id }).from(classes).where(eq(classes.classTeacherId, staffRow.id));

  return { unrestricted: false, classIds: [...new Set([...teaching, ...homeroom].map((r) => r.classId))] };
}

/** Students the user may see, derived from their class scope (current enrollment). */
export async function getTeacherStudentIds(db: Db, user: ApplicationUser): Promise<IdScope> {
  const scope = await getTeacherClassIds(db, user);
  if (scope.unrestricted) return scope;
  if (scope.classIds.length === 0) return { unrestricted: false, ids: [] };

  const rows = await db
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(inArray(enrollments.classId, scope.classIds));

  return { unrestricted: false, ids: [...new Set(rows.map((r) => r.studentId))] };
}

export async function canAccessClass(db: Db, user: ApplicationUser, classId: string): Promise<boolean> {
  const scope = await getTeacherClassIds(db, user);
  return scope.unrestricted || scope.classIds.includes(classId);
}

export async function canAccessStudent(db: Db, user: ApplicationUser, studentId: string): Promise<boolean> {
  const scope = await getTeacherStudentIds(db, user);
  return scope.unrestricted || scope.ids.includes(studentId);
}

/** Staff row for the signed-in user (null for ADMIN without a staff record). */
export async function currentStaffId(db: Db, user: ApplicationUser): Promise<string | null> {
  const [row] = await db.select({ id: staff.id }).from(staff).where(eq(staff.profileId, user.profileId)).limit(1);
  return row?.id ?? null;
}

/** Student ids enrolled in a class for an academic year (authoritative membership). */
export async function classMemberIds(db: Db, classId: string, academicYearId?: string): Promise<string[]> {
  const where = academicYearId
    ? and(eq(enrollments.classId, classId), eq(enrollments.academicYearId, academicYearId), eq(enrollments.status, 'ACTIVE'))
    : and(eq(enrollments.classId, classId), eq(enrollments.status, 'ACTIVE'));
  const rows = await db.select({ studentId: enrollments.studentId }).from(enrollments).where(where);
  return rows.map((r) => r.studentId);
}

export { profiles };
