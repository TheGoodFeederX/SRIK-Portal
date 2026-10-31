import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { staff } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { listQuery, writeAudit } from './audit.ts';
import { idParam } from '../app.ts';
import type { AppEnv } from '../types.ts';

const staffInput = z.object({
  staffNo: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(200),
  icNo: z.string().trim().max(20).nullish(),
  gender: z.enum(['MALE', 'FEMALE']).nullish(),
  dateOfBirth: z.string().date().nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.string().email().max(255).nullish(),
  address: z.string().max(500).nullish(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'PART_TIME']).default('PERMANENT'),
  employmentStatus: z.enum(['ACTIVE', 'RESIGNED', 'RETIRED']).default('ACTIVE'),
  joinDate: z.string().date(),
  endDate: z.string().date().nullish(),
});

export const staffRoutes = new Hono<AppEnv>();

staffRoutes.get('/', requirePermission('staff.read'), async (c) => {
  const { q, limit, offset } = listQuery.parse(c.req.query());
  const where = q ? or(ilike(staff.fullName, `%${q}%`), ilike(staff.staffNo, `%${q}%`)) : undefined;
  const rows = await c.var.db.select().from(staff).where(where).limit(limit).offset(offset);
  const [total] = await c.var.db.select({ count: sql<number>`count(*)::int` }).from(staff).where(where);
  return c.json({ data: rows, meta: { total: total?.count ?? 0, limit, offset }, requestId: c.var.requestId });
});

staffRoutes.get('/:id', requirePermission('staff.read'), async (c) => {
  const [row] = await c.var.db.select().from(staff).where(eq(staff.id, idParam(c))).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Guru tidak dijumpai.' });
  return c.json({ data: row, requestId: c.var.requestId });
});

staffRoutes.post('/', requirePermission('staff.write'), async (c) => {
  const user = requireUser(c);
  const input = staffInput.parse(await c.req.json());
  const [row] = await c.var.db.insert(staff).values(input).returning();
  await writeAudit(c.var.db, {
    actorId: user.id,
    action: 'staff.create',
    resourceType: 'staff',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

staffRoutes.patch('/:id', requirePermission('staff.write'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const input = staffInput.partial().parse(await c.req.json());
  const [before] = await c.var.db.select().from(staff).where(eq(staff.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Guru tidak dijumpai.' });
  const [row] = await c.var.db.update(staff).set({ ...input, updatedAt: new Date() }).where(eq(staff.id, id)).returning();
  await writeAudit(c.var.db, {
    actorId: user.id,
    action: 'staff.update',
    resourceType: 'staff',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});
