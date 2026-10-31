import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { academicYears, enrollments, studentAttendance, students } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { scopedClassIds, writeAudit } from './audit.ts';
import type { AppEnv } from '../types.ts';

const excluded = (col: string) => sql.raw(`excluded."${col}"`);

const takeInput = z.object({
  classId: z.string().uuid(),
  attendanceDate: z.string().date(),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(['PRESENT', 'ABSENT', 'SICK', 'EXCUSED', 'LATE']),
        reason: z.string().max(200).nullish(),
      }),
    )
    .min(1)
    .max(200),
});

export const attendanceRoutes = new Hono<AppEnv>();

attendanceRoutes.get('/attendance/students', requirePermission('attendance.student.read'), async (c) => {
  const user = requireUser(c);
  const date = c.req.query('date');
  const classId = c.req.query('classId');
  const scope = await scopedClassIds(c.var.db, user);
  const filters = [];
  if (date) filters.push(eq(studentAttendance.attendanceDate, date));
  if (classId) filters.push(eq(studentAttendance.classId, classId));
  if (scope) {
    if (scope.length === 0) return c.json({ data: [], requestId: c.var.requestId });
    filters.push(inArray(studentAttendance.classId, scope));
  }
  const rows = await c.var.db
    .select({
      id: studentAttendance.id,
      studentId: studentAttendance.studentId,
      studentNo: students.studentNo,
      fullName: students.fullName,
      classId: studentAttendance.classId,
      attendanceDate: studentAttendance.attendanceDate,
      status: studentAttendance.status,
      reason: studentAttendance.reason,
    })
    .from(studentAttendance)
    .innerJoin(students, eq(students.id, studentAttendance.studentId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(studentAttendance.attendanceDate))
    .limit(500);
  return c.json({ data: rows, requestId: c.var.requestId });
});

/** Idempotent bulk upsert: re-submitting a day corrects instead of duplicating (UNIQUE student+date). */
attendanceRoutes.post('/attendance/students', requirePermission('attendance.student.take'), async (c) => {
  const user = requireUser(c);
  const input = takeInput.parse(await c.req.json());
  const scope = await scopedClassIds(c.var.db, user);
  if (scope && !scope.includes(input.classId)) throw new HTTPException(403, { message: 'Anda hanya boleh merekod kelas anda.' });

  // Only students actually enrolled in this class for the current year can be recorded.
  const enrolled = await c.var.db
    .select({ id: enrollments.studentId })
    .from(enrollments)
    .innerJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
    .where(
      and(
        eq(enrollments.classId, input.classId),
        eq(enrollments.status, 'ACTIVE'),
        eq(academicYears.isCurrent, true),
        inArray(enrollments.studentId, input.records.map((r) => r.studentId)),
      ),
    );
  const known = new Set(enrolled.map((s) => s.id));
  const rows = input.records
    .filter((r) => known.has(r.studentId))
    .map((r) => ({
      studentId: r.studentId,
      classId: input.classId,
      attendanceDate: input.attendanceDate,
      status: r.status,
      reason: r.reason ?? null,
      recordedBy: user.profileId,
    }));
  if (!rows.length) throw new HTTPException(400, { message: 'Tiada rekod sah.' });

  await c.var.db
    .insert(studentAttendance)
    .values(rows)
    .onConflictDoUpdate({
      target: [studentAttendance.studentId, studentAttendance.attendanceDate],
      set: {
        status: excluded('status'),
        reason: excluded('reason'),
        recordedBy: excluded('recorded_by'),
        recordedAt: new Date(),
      },
    });
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'attendance.student.take',
    resourceType: 'student_attendance',
    resourceId: `${input.classId}:${input.attendanceDate}`,
    after: { count: rows.length },
    requestId: c.var.requestId,
  });
  return c.json({ data: { saved: rows.length }, requestId: c.var.requestId });
});
