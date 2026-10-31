import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { academicYears, classes, subjects, teachingAssignments } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { writeAudit } from './audit.ts';
import type { AppEnv } from '../types.ts';

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
  code: z.string().trim().min(1).max(20),
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

export const academicRoutes = new Hono<AppEnv>();

academicRoutes.get('/academic-years', requirePermission('student.read'), async (c) => {
  const rows = await c.var.db.select().from(academicYears).orderBy(academicYears.startDate);
  return c.json({ data: rows, requestId: c.var.requestId });
});

academicRoutes.post('/academic-years', requirePermission('academic.year.manage'), async (c) => {
  const user = requireUser(c);
  const input = yearInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(academicYears).values(input).returning();
  await writeAudit(c.var.db, { actorId: user.id, action: 'academic_year.create', resourceType: 'academic_year', resourceId: row!.id, after: row, requestId: c.var.requestId });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.get('/classes', requirePermission('student.read'), async (c) => {
  const yearId = c.req.query('academicYearId');
  const rows = await c.var.db
    .select()
    .from(classes)
    .where(yearId ? eq(classes.academicYearId, yearId) : undefined);
  return c.json({ data: rows, requestId: c.var.requestId });
});

academicRoutes.post('/classes', requirePermission('academic.class.manage'), async (c) => {
  const user = requireUser(c);
  const input = classInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(classes).values(input).returning();
  await writeAudit(c.var.db, { actorId: user.id, action: 'class.create', resourceType: 'class', resourceId: row!.id, after: row, requestId: c.var.requestId });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.get('/subjects', requirePermission('student.read'), async (c) => {
  const rows = await c.var.db.select().from(subjects).orderBy(subjects.code);
  return c.json({ data: rows, requestId: c.var.requestId });
});

academicRoutes.post('/subjects', requirePermission('academic.subject.manage'), async (c) => {
  const user = requireUser(c);
  const input = subjectInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(subjects).values(input).returning();
  await writeAudit(c.var.db, { actorId: user.id, action: 'subject.create', resourceType: 'subject', resourceId: row!.id, after: row, requestId: c.var.requestId });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

academicRoutes.get('/teaching-assignments', requirePermission('student.read'), async (c) => {
  const teacherId = c.req.query('teacherId');
  const rows = await c.var.db
    .select()
    .from(teachingAssignments)
    .where(teacherId ? eq(teachingAssignments.teacherId, teacherId) : undefined);
  return c.json({ data: rows, requestId: c.var.requestId });
});

academicRoutes.post('/teaching-assignments', requirePermission('academic.assignment.manage'), async (c) => {
  const user = requireUser(c);
  const input = assignmentInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(teachingAssignments).values(input).returning();
  await writeAudit(c.var.db, { actorId: user.id, action: 'teaching_assignment.create', resourceType: 'teaching_assignment', resourceId: row!.id, after: row, requestId: c.var.requestId });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});
