import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { academicYears, classes, timetableEntries, timetablePeriods } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { canAccessClass, currentStaffId } from '../auth/scope.ts';
import { idParam, parse } from '../app.ts';
import { writeAudit } from './audit.ts';
import { assertYearMutable } from '../services/academic.ts';
import {
  SCHOOL_DAYS,
  assignmentOptions,
  countTimetableReferences,
  listEntries,
  listPeriods,
  mapUniqueViolationToConflict,
  timetableSummary,
  validateTimetableEntry,
} from '../services/timetable.ts';
import type { AppEnv } from '../types.ts';

const dayEnum = z.enum(SCHOOL_DAYS);
const periodTypeEnum = z.enum(['LESSON', 'BREAK', 'ASSEMBLY', 'PRAYER', 'ACTIVITY', 'OTHER']);

const periodInput = z.object({
  academicYearId: z.string().uuid(),
  periodNo: z.number().int().min(1).max(30),
  label: z.string().trim().min(1).max(60),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  type: periodTypeEnum.default('LESSON'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(1).max(30).optional(),
});

const entryInput = z.object({
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  periodId: z.string().uuid(),
  dayOfWeek: dayEnum,
  teachingAssignmentId: z.string().uuid().nullish(),
  entryType: periodTypeEnum.default('LESSON'),
  room: z.string().trim().max(60).nullish(),
  label: z.string().trim().max(60).nullish(),
  notes: z.string().trim().max(300).nullish(),
});

const filterQuery = z.object({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  dayOfWeek: dayEnum.optional(),
  periodId: z.string().uuid().optional(),
});

export const timetableRoutes = new Hono<AppEnv>();

async function resolvedYear(db: AppEnv['Variables']['db'], requested?: string): Promise<string> {
  if (requested) return requested;
  const [current] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true))
    .limit(1);
  if (!current) throw new HTTPException(400, { message: 'Tiada tahun akademik semasa.', cause: { code: 'INVALID_ACADEMIC_YEAR' } });
  return current.id;
}

/* ------------------------------- periods ------------------------------- */

timetableRoutes.get('/timetable/periods', requirePermission('timetable.read'), async (c) => {
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  const rows = await listPeriods(c.var.db, yearId);
  return c.json({ data: rows, meta: { total: rows.length, academicYearId: yearId }, requestId: c.var.requestId });
});

timetableRoutes.post('/timetable/periods', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(periodInput, await c.req.json().catch(() => ({})));
  await assertYearMutable(c.var.db, input.academicYearId);
  if (input.startTime >= input.endTime) {
    throw new HTTPException(400, { message: 'Masa mula mesti sebelum masa tamat.', cause: { code: 'VALIDATION' } });
  }
  const sortOrder = input.sortOrder ?? input.periodNo;
  try {
    const [row] = await c.var.db
      .insert(timetablePeriods)
      .values({ ...input, sortOrder })
      .returning();
    await writeAudit(c.var.db, {
      actorId: actor.profileId,
      action: 'timetable.period.create',
      resourceType: 'timetable_period',
      resourceId: row!.id,
      after: row,
      requestId: c.var.requestId,
    });
    return c.json({ data: row, requestId: c.var.requestId }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new HTTPException(409, { message: 'Nombor waktu ini sudah wujud.', cause: { code: 'TIMETABLE_PERIOD_EXISTS' } });
    }
    throw err;
  }
});

timetableRoutes.patch('/timetable/periods/:id', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(periodInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(timetablePeriods).where(eq(timetablePeriods.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Waktu tidak dijumpai.', cause: { code: 'TIMETABLE_PERIOD_NOT_FOUND' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  const nextStart = input.startTime ?? before.startTime;
  const nextEnd = input.endTime ?? before.endTime;
  if (nextStart >= nextEnd) {
    throw new HTTPException(400, { message: 'Masa mula mesti sebelum masa tamat.', cause: { code: 'VALIDATION' } });
  }
  const [row] = await c.var.db
    .update(timetablePeriods)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(timetablePeriods.id, id))
    .returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'timetable.period.update',
    resourceType: 'timetable_period',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/** Deleting a period is only allowed while no entry uses it (§22). */
timetableRoutes.delete('/timetable/periods/:id', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [before] = await c.var.db.select().from(timetablePeriods).where(eq(timetablePeriods.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Waktu tidak dijumpai.', cause: { code: 'TIMETABLE_PERIOD_NOT_FOUND' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  const [used] = await c.var.db
    .select({ total: sql<number>`count(*)::int` })
    .from(timetableEntries)
    .where(eq(timetableEntries.periodId, id));
  if (Number(used?.total ?? 0) > 0) {
    throw new HTTPException(409, { message: 'Waktu ini masih digunakan. Nyahaktifkan sebagai ganti.', cause: { code: 'TIMETABLE_PERIOD_IN_USE' } });
  }
  await c.var.db.delete(timetablePeriods).where(eq(timetablePeriods.id, id));
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'timetable.period.delete',
    resourceType: 'timetable_period',
    resourceId: id,
    before,
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});

/* -------------------------------- entries ------------------------------- */

timetableRoutes.get('/timetable/entries', requirePermission('timetable.read'), async (c) => {
  const user = requireUser(c);
  const query = parse(filterQuery, c.req.query());
  const yearId = await resolvedYear(c.var.db, query.academicYearId);

  // Teachers may only read entries for classes in their scope (§21).
  if (!user.roles.includes('ADMIN')) {
    const staffId = await currentStaffId(c.var.db, user);
    if (!staffId) return c.json({ data: [], meta: { total: 0, academicYearId: yearId }, requestId: c.var.requestId });
    if (query.classId && !(await canAccessClass(c.var.db, user, query.classId))) {
      throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'CLASS_SCOPE_DENIED' } });
    }
    if (!query.classId) {
      // Own timetables only: their classes plus anything they teach.
      const rows = await listEntries(c.var.db, { ...query, academicYearId: yearId, teacherId: staffId });
      return c.json({ data: rows, meta: { total: rows.length, academicYearId: yearId }, requestId: c.var.requestId });
    }
  }

  const rows = await listEntries(c.var.db, { ...query, academicYearId: yearId });
  return c.json({ data: rows, meta: { total: rows.length, academicYearId: yearId }, requestId: c.var.requestId });
});

timetableRoutes.post('/timetable/entries', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(entryInput, await c.req.json().catch(() => ({})));
  const resolved = await validateTimetableEntry(c.var.db, input);
  try {
    const [row] = await c.var.db.insert(timetableEntries).values(resolved).returning();
    await writeAudit(c.var.db, {
      actorId: actor.profileId,
      action: 'timetable.entry.create',
      resourceType: 'timetable_entry',
      resourceId: row!.id,
      after: row,
      requestId: c.var.requestId,
    });
    return c.json({ data: row, requestId: c.var.requestId }, 201);
  } catch (err) {
    mapUniqueViolationToConflict(err);
    throw err;
  }
});

timetableRoutes.patch('/timetable/entries/:id', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(entryInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(timetableEntries).where(eq(timetableEntries.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Jadual tidak dijumpai.', cause: { code: 'TIMETABLE_ENTRY_NOT_FOUND' } });
  const merged = {
    academicYearId: input.academicYearId ?? before.academicYearId,
    classId: input.classId ?? before.classId,
    periodId: input.periodId ?? before.periodId,
    dayOfWeek: input.dayOfWeek ?? before.dayOfWeek,
    teachingAssignmentId: input.teachingAssignmentId ?? before.teachingAssignmentId,
    entryType: input.entryType ?? before.entryType,
    room: input.room ?? before.room,
    label: input.label ?? before.label,
    notes: input.notes ?? before.notes,
  };
  const resolved = await validateTimetableEntry(c.var.db, merged, id);
  try {
    const [row] = await c.var.db
      .update(timetableEntries)
      .set({ ...resolved, updatedAt: new Date() })
      .where(eq(timetableEntries.id, id))
      .returning();
    await writeAudit(c.var.db, {
      actorId: actor.profileId,
      action: 'timetable.entry.update',
      resourceType: 'timetable_entry',
      resourceId: id,
      before,
      after: row,
      requestId: c.var.requestId,
    });
    return c.json({ data: row, requestId: c.var.requestId });
  } catch (err) {
    mapUniqueViolationToConflict(err);
    throw err;
  }
});

timetableRoutes.delete('/timetable/entries/:id', requirePermission('timetable.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [before] = await c.var.db.select().from(timetableEntries).where(eq(timetableEntries.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Jadual tidak dijumpai.', cause: { code: 'TIMETABLE_ENTRY_NOT_FOUND' } });
  await assertYearMutable(c.var.db, before.academicYearId);
  await c.var.db.delete(timetableEntries).where(eq(timetableEntries.id, id));
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'timetable.entry.delete',
    resourceType: 'timetable_entry',
    resourceId: id,
    before,
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});

/* --------------------------------- views -------------------------------- */

async function matrix(db: AppEnv['Variables']['db'], yearId: string, filters: { classId?: string; teacherId?: string }) {
  const periods = await listPeriods(db, yearId);
  const entries = await listEntries(db, { academicYearId: yearId, ...filters });
  return {
    academicYearId: yearId,
    days: [...SCHOOL_DAYS],
    periods,
    entries,
  };
}

timetableRoutes.get('/timetable/classes/:id', requirePermission('timetable.read'), async (c) => {
  const user = requireUser(c);
  const classId = idParam(c);
  if (!(await canAccessClass(c.var.db, user, classId))) {
    throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'CLASS_SCOPE_DENIED' } });
  }
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  const [classRow] = await c.var.db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1);
  const data = await matrix(c.var.db, yearId, { classId });
  return c.json({ data: { ...data, className: classRow?.name ?? null }, requestId: c.var.requestId });
});

timetableRoutes.get('/timetable/teachers/:id', requirePermission('timetable.read'), async (c) => {
  const user = requireUser(c);
  const teacherId = idParam(c);
  if (!user.roles.includes('ADMIN')) {
    const own = await currentStaffId(c.var.db, user);
    if (own !== teacherId) {
      throw new HTTPException(403, { message: 'Anda hanya boleh melihat jadual sendiri.', cause: { code: 'CLASS_SCOPE_DENIED' } });
    }
  }
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  const data = await matrix(c.var.db, yearId, { teacherId });
  return c.json({ data, requestId: c.var.requestId });
});

timetableRoutes.get('/timetable/me', requirePermission('timetable.read'), async (c) => {
  const user = requireUser(c);
  const staffId = await currentStaffId(c.var.db, user);
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  if (!staffId) return c.json({ data: { academicYearId: yearId, days: [...SCHOOL_DAYS], periods: await listPeriods(c.var.db, yearId), entries: [] }, requestId: c.var.requestId });
  const data = await matrix(c.var.db, yearId, { teacherId: staffId });
  return c.json({ data, requestId: c.var.requestId });
});

timetableRoutes.get('/timetable/assignment-options', requirePermission('timetable.read'), async (c) => {
  const user = requireUser(c);
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  const classId = c.req.query('classId');
  if (!classId) throw new HTTPException(400, { message: 'classId diperlukan.', cause: { code: 'VALIDATION' } });
  if (!(await canAccessClass(c.var.db, user, classId))) {
    throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'CLASS_SCOPE_DENIED' } });
  }
  const rows = await assignmentOptions(c.var.db, yearId, classId);
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

timetableRoutes.get('/timetable/summary', requirePermission('timetable.read'), async (c) => {
  const yearId = await resolvedYear(c.var.db, c.req.query('academicYearId'));
  const data = await timetableSummary(c.var.db, yearId);
  return c.json({ data, requestId: c.var.requestId });
});

/* Assignment deletion guard is exposed for the academic route (§38). */
export async function assignmentReferenceCount(db: AppEnv['Variables']['db'], assignmentId: string) {
  return countTimetableReferences(db, assignmentId);
}
