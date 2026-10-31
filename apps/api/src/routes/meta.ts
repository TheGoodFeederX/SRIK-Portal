import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { requirePermission } from '../auth/session.ts';
import type { AppEnv } from '../types.ts';

export const metaRoutes = new Hono<AppEnv>();

/** Dashboard counters for the four portfolio landings. */
metaRoutes.get('/summary', requirePermission('student.read'), async (c) => {
  const q = (statement: ReturnType<typeof sql>) => c.var.db.execute(statement).then((r) => Number((r as unknown as { count: number }[])[0]?.count ?? 0));
  const [students, staff, classes, years, attendanceToday] = await Promise.all([
    q(sql`SELECT count(*)::int AS count FROM students WHERE status = 'ACTIVE'`),
    q(sql`SELECT count(*)::int AS count FROM staff WHERE employment_status = 'ACTIVE'`),
    q(sql`SELECT count(*)::int AS count FROM classes WHERE status = 'ACTIVE'`),
    q(sql`SELECT count(*)::int AS count FROM academic_years WHERE status = 'ACTIVE'`),
    q(sql`SELECT count(*)::int AS count FROM student_attendance WHERE attendance_date = CURRENT_DATE`),
  ]);
  return c.json({
    data: { students, staff, classes, academicYears: years, attendanceRecordedToday: attendanceToday },
    requestId: c.var.requestId,
  });
});
