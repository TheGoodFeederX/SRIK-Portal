import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { academicYears, classes, enrollments, subjects, teachingAssignments } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { currentStaffId, getTeacherClassIds } from '../auth/scope.ts';
import { idParam, parse } from '../app.ts';
import { writeAudit } from './audit.ts';
import {
  assertActiveSubject,
  assertActiveTeacher,
  assertAssignmentUnique,
  assertClassInYear,
  assertStudentExists,
  assertYearMutable,
  classRosterCount,
  findEnrollment,
  listAssignments,
  listEnrollments,
  listSubjects,
  subjectFilters,
} from '../services/academic.ts';
import type { AppEnv } from '../types.ts';

/* ------------------------------- schemas ------------------------------- */

const yearInput = z.object({
  name: z.string().trim().min(4).max(20),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isCurrent: z.boolean().default(false),
  status: z.enum(['PLANNED', 'ACTIVE', 'CLOSED']).default('PLANNED'),
});

const classInput = z.object({
  academicYearId: z.string().uuid(),
  yearLevel: z.number().int().min(1).max(6),
  name: z.string().trim().min(1).max(50),
  classTeacherId: z.string().uuid().nullish(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

const subjectInput = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9._-]+$/),
  nameMs: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100).nullish(),
  isActive: z.boolean().default(true),
});

const assignmentInput = z.object({
  academicYearId: z.string().uuid(),
  teacherId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

const enrollmentInput = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  enrolledAt: z.string().date().optional(),
});

const bulkEnrollmentInput = z.object({
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  enrolledAt: z.string().date().optional(),
});

const listQuery = z.object({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED']).optional(),
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
});

export const academicRoutes = new Hono<AppEnv>();
const today = () => new Date().toISOString().slice(0, 10);

/* ----------------------------- academic years ---------------------------- */

academicRoutes.get('/academic-years', requirePermission('academic.year.read'), async (c) => {
  const rows = await c.var.db.select().from(academicYears).orderBy(desc(academicYears.startDate));
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

academicRoutes.post('/academic-years', requirePermission('academic.year.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(yearInput, await c.req.json().catch(() => ({})));
  const [row] = await c.var.db.insert(academicYears).values(input).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'academic_year.create',
    resourceType: 'academic_year',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.patch('/academic-years/:id', requirePermission('academic.year.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(yearInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(academicYears).where(eq(academicYears.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Tahun akademik tidak dijumpai.', cause: { code: 'INVALID_ACADEMIC_YEAR' } });
  const [row] = await c.var.db.update(academicYears).set(input).where(eq(academicYears.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'academic_year.update',
    resourceType: 'academic_year',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/* -------------------------------- classes -------------------------------- */

academicRoutes.get('/classes', requirePermission('academic.class.read'), async (c) => {
  const user = requireUser(c);
  const yearId = c.req.query('academicYearId');
  const rows = await c.var.db
    .select()
    .from(classes)
    .where(yearId ? eq(classes.academicYearId, yearId) : undefined)
    .orderBy(classes.name);
  const scope = await getTeacherClassIds(c.var.db, user);
  const data = scope.unrestricted ? rows : rows.filter((r) => scope.classIds.includes(r.id));
  return c.json({ data, meta: { total: data.length }, requestId: c.var.requestId });
});

academicRoutes.post('/classes', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(classInput, await c.req.json().catch(() => ({})));
  await assertYearMutable(c.var.db, input.academicYearId);
  if (input.classTeacherId) await assertActiveTeacher(c.var.db, input.classTeacherId);
  const [row] = await c.var.db.insert(classes).values(input).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'class.create',
    resourceType: 'class',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.patch('/classes/:id', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(classInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(classes).where(eq(classes.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Kelas tidak dijumpai.', cause: { code: 'INVALID_CLASS' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  if (input.classTeacherId) await assertActiveTeacher(c.var.db, input.classTeacherId);
  const [row] = await c.var.db.update(classes).set(input).where(eq(classes.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'class.update',
    resourceType: 'class',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/* -------------------------------- subjects ------------------------------- */

academicRoutes.get('/subjects', requirePermission('academic.subject.read'), async (c) => {
  const query = listQuery.parse(c.req.query());
  const rows = await listSubjects(c.var.db, subjectFilters(query));
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

academicRoutes.post('/subjects', requirePermission('academic.subject.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(subjectInput, await c.req.json().catch(() => ({})));
  const code = input.code.toUpperCase();
  const [clash] = await c.var.db.select({ id: subjects.id }).from(subjects).where(eq(subjects.code, code)).limit(1);
  if (clash) throw new HTTPException(409, { message: 'Kod mata pelajaran sudah wujud.', cause: { code: 'SUBJECT_CODE_EXISTS' } });
  const [row] = await c.var.db.insert(subjects).values({ ...input, code }).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'subject.create',
    resourceType: 'subject',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.patch('/subjects/:id', requirePermission('academic.subject.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(subjectInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Mata pelajaran tidak dijumpai.', cause: { code: 'INVALID_SUBJECT' } });
  if (input.code) {
    const code = input.code.toUpperCase();
    const [clash] = await c.var.db.select({ id: subjects.id }).from(subjects).where(eq(subjects.code, code)).limit(1);
    if (clash && clash.id !== id) {
      throw new HTTPException(409, { message: 'Kod mata pelajaran sudah wujud.', cause: { code: 'SUBJECT_CODE_EXISTS' } });
    }
    input.code = code;
  }
  const [row] = await c.var.db.update(subjects).set(input).where(eq(subjects.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: input.isActive === false ? 'subject.deactivate' : 'subject.update',
    resourceType: 'subject',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/* --------------------------- teaching assignments ------------------------ */

academicRoutes.get('/teaching-assignments', requirePermission('academic.assignment.read'), async (c) => {
  const user = requireUser(c);
  const query = listQuery.parse(c.req.query());
  if (user.roles.includes('ADMIN')) {
    const rows = await listAssignments(c.var.db, query);
    return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
  }
  const staffId = await currentStaffId(c.var.db, user);
  if (!staffId) return c.json({ data: [], meta: { total: 0 }, requestId: c.var.requestId });
  const rows = await listAssignments(c.var.db, { ...query, teacherId: staffId });
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

academicRoutes.post('/teaching-assignments', requirePermission('academic.assignment.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(assignmentInput, await c.req.json().catch(() => ({})));
  await assertYearMutable(c.var.db, input.academicYearId);
  await assertClassInYear(c.var.db, input.classId, input.academicYearId);
  await assertActiveSubject(c.var.db, input.subjectId);
  await assertActiveTeacher(c.var.db, input.teacherId);
  await assertAssignmentUnique(c.var.db, input);
  const [row] = await c.var.db.insert(teachingAssignments).values(input).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'teaching_assignment.create',
    resourceType: 'teaching_assignment',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.patch('/teaching-assignments/:id', requirePermission('academic.assignment.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(assignmentInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(teachingAssignments).where(eq(teachingAssignments.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Agihan tidak dijumpai.', cause: { code: 'ASSIGNMENT_NOT_FOUND' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  const next = { ...before, ...input };
  await assertClassInYear(c.var.db, next.classId, next.academicYearId);
  await assertActiveSubject(c.var.db, next.subjectId);
  await assertActiveTeacher(c.var.db, next.teacherId);
  await assertAssignmentUnique(c.var.db, next, id);
  const [row] = await c.var.db.update(teachingAssignments).set(input).where(eq(teachingAssignments.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'teaching_assignment.update',
    resourceType: 'teaching_assignment',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/** v1.2 §31: deletion is allowed only while unused (no timetable/exam references yet). */
academicRoutes.delete('/teaching-assignments/:id', requirePermission('academic.assignment.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [before] = await c.var.db.select().from(teachingAssignments).where(eq(teachingAssignments.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Agihan tidak dijumpai.', cause: { code: 'ASSIGNMENT_NOT_FOUND' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  await c.var.db.delete(teachingAssignments).where(eq(teachingAssignments.id, id));
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'teaching_assignment.delete',
    resourceType: 'teaching_assignment',
    resourceId: id,
    before,
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});

/* ------------------------------ enrollments ------------------------------ */

academicRoutes.get('/enrollments', requirePermission('student.read'), async (c) => {
  const user = requireUser(c);
  const query = listQuery.parse(c.req.query());
  const scope = await getTeacherClassIds(c.var.db, user);
  if (!scope.unrestricted) {
    if (scope.classIds.length === 0) return c.json({ data: [], meta: { total: 0 }, requestId: c.var.requestId });
    if (query.classId && !scope.classIds.includes(query.classId)) {
      throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'CLASS_SCOPE_DENIED' } });
    }
  }
  const rows = await listEnrollments(c.var.db, query);
  const data = scope.unrestricted ? rows : rows.filter((r) => scope.classIds.includes(r.classId));
  return c.json({ data, meta: { total: data.length }, requestId: c.var.requestId });
});

academicRoutes.get('/classes/:id/students', requirePermission('student.read'), async (c) => {
  const user = requireUser(c);
  const classId = idParam(c);
  const scope = await getTeacherClassIds(c.var.db, user);
  if (!scope.unrestricted && !scope.classIds.includes(classId)) {
    throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'CLASS_SCOPE_DENIED' } });
  }
  const yearId = c.req.query('academicYearId');
  const rows = await listEnrollments(c.var.db, { classId, academicYearId: yearId });
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

academicRoutes.post('/enrollments', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(enrollmentInput, await c.req.json().catch(() => ({})));
  await assertYearMutable(c.var.db, input.academicYearId);
  await assertClassInYear(c.var.db, input.classId, input.academicYearId);
  await assertStudentExists(c.var.db, input.studentId);
  if (await findEnrollment(c.var.db, input.studentId, input.academicYearId)) {
    throw new HTTPException(409, {
      message: 'Murid sudah didaftarkan untuk tahun ini. Gunakan pindah kelas.',
      cause: { code: 'ENROLLMENT_EXISTS' },
    });
  }
  const [row] = await c.var.db
    .insert(enrollments)
    .values({
      studentId: input.studentId,
      classId: input.classId,
      academicYearId: input.academicYearId,
      enrolledAt: input.enrolledAt ?? today(),
      status: 'ACTIVE',
    })
    .returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'enrollment.create',
    resourceType: 'enrollment',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

/** Bulk assign in one transaction; any invalid student rolls the whole batch back (§36). */
academicRoutes.post('/enrollments/bulk', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(bulkEnrollmentInput, await c.req.json().catch(() => ({})));
  await assertYearMutable(c.var.db, input.academicYearId);
  await assertClassInYear(c.var.db, input.classId, input.academicYearId);

  const created = await c.var.db.transaction(async (tx) => {
    const rows: unknown[] = [];
    for (const studentId of input.studentIds) {
      await assertStudentExists(tx as never, studentId);
      if (await findEnrollment(tx as never, studentId, input.academicYearId)) {
        throw new HTTPException(409, {
          message: 'Sekurang-kurangnya seorang murid sudah didaftarkan tahun ini.',
          cause: { code: 'ENROLLMENT_EXISTS' },
        });
      }
      const [row] = await tx
        .insert(enrollments)
        .values({
          studentId,
          classId: input.classId,
          academicYearId: input.academicYearId,
          enrolledAt: input.enrolledAt ?? today(),
          status: 'ACTIVE',
        })
        .returning();
      rows.push(row);
    }
    return rows;
  });

  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'enrollment.create',
    resourceType: 'enrollment',
    resourceId: input.classId,
    after: { count: created.length, studentIds: input.studentIds },
    requestId: c.var.requestId,
  });
  return c.json({ data: { enrolled: created.length }, requestId: c.var.requestId }, 201);
});

/** Within-year transfer updates the single enrollment row (spec v1.2 §17). */
academicRoutes.patch('/enrollments/:id/class', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const { classId } = parse(z.object({ classId: z.string().uuid() }), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(enrollments).where(eq(enrollments.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Pendaftaran tidak dijumpai.', cause: { code: 'STUDENT_NOT_ENROLLED' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  await assertClassInYear(c.var.db, classId, before.academicYearId);
  const [row] = await c.var.db
    .update(enrollments)
    .set({ classId, status: 'ACTIVE', leftAt: null })
    .where(eq(enrollments.id, id))
    .returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'enrollment.class_change',
    resourceType: 'enrollment',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

academicRoutes.post('/enrollments/:id/end', requirePermission('academic.class.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const { status } = parse(
    z.object({ status: z.enum(['TRANSFERRED', 'WITHDRAWN', 'COMPLETED']).default('COMPLETED') }),
    await c.req.json().catch(() => ({})),
  );
  const [before] = await c.var.db.select().from(enrollments).where(eq(enrollments.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Pendaftaran tidak dijumpai.', cause: { code: 'STUDENT_NOT_ENROLLED' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  const [row] = await c.var.db.update(enrollments).set({ status, leftAt: today() }).where(eq(enrollments.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'enrollment.end',
    resourceType: 'enrollment',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/* --------------------------- academic summary ---------------------------- */

academicRoutes.get('/academic/summary', requirePermission('academic.year.read'), async (c) => {
  const [year] = await c.var.db
    .select({ id: academicYears.id, name: academicYears.name })
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true))
    .limit(1);
  const classRows = await c.var.db.select({ id: classes.id }).from(classes).where(eq(classes.status, 'ACTIVE'));
  const subjectRows = await c.var.db.select({ id: subjects.id }).from(subjects).where(eq(subjects.isActive, true));
  const assignmentRows = await c.var.db.select({ id: teachingAssignments.id }).from(teachingAssignments);
  const enrollmentRows = year
    ? await c.var.db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.academicYearId, year.id), eq(enrollments.status, 'ACTIVE')))
    : [];

  return c.json({
    data: {
      currentYear: year ?? null,
      activeClasses: classRows.length,
      activeSubjects: subjectRows.length,
      teachingAssignments: assignmentRows.length,
      activeEnrollments: enrollmentRows.length,
      largestClassRoster: year && classRows[0] ? await classRosterCount(c.var.db, classRows[0].id, year.id) : 0,
    },
    requestId: c.var.requestId,
  });
});
