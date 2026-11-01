import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { auditLog } from '@srik/db';
import type { AppEnv, ApplicationUser } from '../types.ts';
import { requirePermission } from '../auth/session.ts';
import { getTeacherClassIds, getTeacherStudentIds } from '../auth/scope.ts';

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
/** @deprecated use auth/scope.ts getTeacherClassIds — kept for existing call sites. */
export async function scopedClassIds(db: Db, user: ApplicationUser): Promise<string[] | null> {
  const scope = await getTeacherClassIds(db, user);
  return scope.unrestricted ? null : scope.classIds;
}


/** Student ids visible to the user (null = all). Teachers: their classes' enrollments. */
export async function scopedStudentIds(db: Db, user: ApplicationUser): Promise<string[] | null> {
  const scope = await getTeacherStudentIds(db, user);
  return scope.unrestricted ? null : scope.ids;
}

export const auditLogRoutes = new Hono<AppEnv>();

auditLogRoutes.get('/', requirePermission('system.audit.read'), async (c) => {
  const rows = await c.var.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100);
  return c.json({ data: rows, requestId: c.var.requestId });
});
