import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq, inArray } from 'drizzle-orm';
import { auditLog, classes, enrollments, staff, teachingAssignments } from '@srik/db';
import type { AppEnv, SessionUser } from '../types.ts';
import { requirePermission } from '../auth/session.ts';

type Db = AppEnv['Variables']['db'];

/** Best-effort audit write. Never blocks the request on failure. */
export function writeAudit(
  db: Db,
  entry: {
    actorId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    before?: unknown;
    after?: unknown;
    requestId?: string | null;
  },
) {
  return db
    .insert(auditLog)
    .values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
      requestId: entry.requestId ?? null,
    })
    .catch((err) => console.error(JSON.stringify({ level: 'warn', message: 'audit write failed', err: String(err) })));
}

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Record scope for TEACHER users: classes they teach (teaching assignment) or class-teach (homeroom).
 * ADMIN is unrestricted. Returns null = unrestricted, [] = no records visible.
 */
export async function scopedClassIds(db: Db, user: SessionUser): Promise<string[] | null> {
  if (user.roles.includes('ADMIN')) return null;
  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.profileId, user.id)).limit(1);
  if (!staffRow) return [];
  const teaching = await db
    .select({ classId: teachingAssignments.classId })
    .from(teachingAssignments)
    .where(eq(teachingAssignments.teacherId, staffRow.id));
  const homeroom = await db.select({ classId: classes.id }).from(classes).where(eq(classes.classTeacherId, staffRow.id));
  return [...new Set([...teaching, ...homeroom].map((r) => r.classId))];
}

/** Student ids visible to the user (null = all). Teachers: their classes' enrollments. */
export async function scopedStudentIds(db: Db, user: SessionUser): Promise<string[] | null> {
  const classIds = await scopedClassIds(db, user);
  if (classIds === null) return null;
  if (classIds.length === 0) return [];
  const rows = await db.select({ studentId: enrollments.studentId }).from(enrollments).where(inArray(enrollments.classId, classIds));
  return [...new Set(rows.map((r) => r.studentId))];
}

export const auditLogRoutes = new Hono<AppEnv>();

auditLogRoutes.get('/', requirePermission('system.audit.read'), async (c) => {
  const rows = await c.var.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100);
  return c.json({ data: rows, requestId: c.var.requestId });
});
