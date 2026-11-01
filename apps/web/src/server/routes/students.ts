import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { guardians, students, studentGuardians } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { listQuery, scopedStudentIds, writeAudit } from './audit.ts';
import { idParam } from '../app.ts';
import type { AppEnv } from '../types.ts';

const studentInput = z.object({
  studentNo: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(200),
  icNo: z.string().trim().max(20).nullish(),
  birthCertificateNo: z.string().trim().max(30).nullish(),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.string().date(),
  birthPlace: z.string().max(100).nullish(),
  status: z.enum(['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN']).default('ACTIVE'),
  enrollmentDate: z.string().date(),
  exitDate: z.string().date().nullish(),
});

const guardianInput = z.object({
  fullName: z.string().trim().min(1).max(200),
  icNo: z.string().trim().max(20).nullish(),
  phone: z.string().trim().min(1).max(30),
  email: z.string().email().max(255).nullish(),
  occupation: z.string().max(100).nullish(),
  address: z.string().max(500).nullish(),
  relationship: z.string().trim().min(1).max(50),
  isPrimary: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
  canReceiveResults: z.boolean().default(true),
});

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.get('/', requirePermission('student.read'), async (c) => {
  const user = requireUser(c);
  const { q, limit, offset } = listQuery.parse(c.req.query());
  const scope = await scopedStudentIds(c.var.db, user);
  if (scope && scope.length === 0) {
    return c.json({ data: [], meta: { total: 0, limit, offset }, requestId: c.var.requestId });
  }
  const filters: SQL[] = [];
  if (q) filters.push(or(ilike(students.fullName, `%${q}%`), ilike(students.studentNo, `%${q}%`))!);
  if (scope) filters.push(inArray(students.id, scope));
  const where = filters.length ? and(...filters) : undefined;
  const rows = await c.var.db.select().from(students).where(where).limit(limit).offset(offset);
  const [total] = await c.var.db.select({ count: sql<number>`count(*)::int` }).from(students).where(where);
  return c.json({ data: rows, meta: { total: total?.count ?? 0, limit, offset }, requestId: c.var.requestId });
});

studentRoutes.get('/:id', requirePermission('student.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const scope = await scopedStudentIds(c.var.db, user);
  if (scope && !scope.includes(id)) throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.' });
  const [row] = await c.var.db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Murid tidak dijumpai.' });
  const guardianRows = await c.var.db
    .select({
      id: guardians.id,
      fullName: guardians.fullName,
      phone: guardians.phone,
      email: guardians.email,
      relationship: studentGuardians.relationship,
      isPrimary: studentGuardians.isPrimary,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, id));
  return c.json({ data: { ...row, guardians: guardianRows }, requestId: c.var.requestId });
});

studentRoutes.post('/', requirePermission('student.write'), async (c) => {
  const user = requireUser(c);
  const input = studentInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(students).values(input).returning();
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'student.create',
    resourceType: 'student',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

studentRoutes.patch('/:id', requirePermission('student.write'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const input = studentInput.partial().parse(await c.req.json());
  const [before] = await c.var.db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Murid tidak dijumpai.' });
  const [row] = await c.var.db.update(students).set({ ...input, updatedAt: new Date() }).where(eq(students.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'student.update',
    resourceType: 'student',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

studentRoutes.post('/:id/guardians', requirePermission('student.write'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const { relationship, isPrimary, isEmergencyContact, canReceiveResults, ...guardian } = guardianInput.parse(await c.req.json());
  const [student] = await c.var.db.select({ id: students.id }).from(students).where(eq(students.id, id)).limit(1);
  if (!student) throw new HTTPException(404, { message: 'Murid tidak dijumpai.' });
  const [guardianRow] = await c.var.db.insert(guardians).values(guardian).returning();
  await c.var.db.insert(studentGuardians).values({
    studentId: id,
    guardianId: guardianRow!.id,
    relationship,
    isPrimary,
    isEmergencyContact,
    canReceiveResults,
  });
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'student.guardian.link',
    resourceType: 'student',
    resourceId: id,
    after: { guardian: guardianRow, relationship },
    requestId: c.var.requestId,
  });
  return c.json({ data: { ...guardianRow, relationship, isPrimary, isEmergencyContact }, requestId: c.var.requestId }, 201);
});
