import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { importRows, importSessions } from '@srik/db';
import { IMPORT_SPECS, IMPORT_TYPES, type ImportType } from '@srik/shared';
import { requirePermission, requireUser } from '../auth/session.ts';
import { idParam, parse } from '../app.ts';
import { writeAudit } from './audit.ts';
import { buildTemplateWorkbook, parseWorkbook } from '../services/imports/parser.ts';
import { summarise, validateRows } from '../services/imports/validate.ts';
import { commitImport } from '../services/imports/commit.ts';
import type { AppEnv } from '../types.ts';

const typeSchema = z.enum(IMPORT_TYPES);

const resolutionInput = z.object({
  rows: z.array(z.object({ rowNumber: z.number().int().min(1), resolution: z.enum(['SKIP', 'REPLACE']).nullable() })).max(5000),
});

export const importRoutes = new Hono<AppEnv>();
const manage = requirePermission('system.data.import');

/* -------------------------------- upload --------------------------------- */

/** Upload stages a workbook only — no domain table is touched here (§5, §25). */
importRoutes.post('/imports', manage, async (c) => {
  const actor = requireUser(c);
  const form = await c.req.formData().catch(() => null);
  if (!form) throw new HTTPException(400, { message: 'Permintaan mesti multipart/form-data.', cause: { code: 'IMPORT_FILE_INVALID' } });

  const type = parse(typeSchema, String(form.get('type') ?? ''));
  const file = form.get('file');
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'Fail tidak dijumpai.', cause: { code: 'IMPORT_FILE_INVALID' } });
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new HTTPException(400, { message: 'Hanya fail .xlsx diterima.', cause: { code: 'IMPORT_FILE_INVALID' } });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseWorkbook(buffer, type as ImportType);

  const [session] = await c.var.db
    .insert(importSessions)
    .values({ type, filename: file.name, uploadedBy: actor.profileId, rowCount: parsed.rows.length, status: 'UPLOADED' })
    .returning();

  if (parsed.rows.length) {
    await c.var.db.insert(importRows).values(
      parsed.rows.map((r) => ({
        importSessionId: session!.id,
        rowNumber: r.rowNumber,
        rawData: r.data,
        status: 'VALID' as const,
      })),
    );
  }

  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'import.upload',
    resourceType: 'import_session',
    resourceId: session!.id,
    after: { type, filename: file.name, rows: parsed.rows.length },
    requestId: c.var.requestId,
  });

  return c.json({ data: { id: session!.id, type, filename: file.name, rowCount: parsed.rows.length, status: session!.status }, requestId: c.var.requestId }, 201);
});

/* ------------------------------- validate -------------------------------- */

importRoutes.post('/imports/:id/validate', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [session] = await c.var.db.select().from(importSessions).where(eq(importSessions.id, id)).limit(1);
  if (!session) throw new HTTPException(404, { message: 'Sesi import tidak dijumpai.', cause: { code: 'IMPORT_SESSION_NOT_FOUND' } });
  if (session.status === 'COMPLETED' || session.status === 'CONFIRMED' || session.status === 'PROCESSING') {
    throw new HTTPException(409, { message: 'Sesi ini telah disahkan.', cause: { code: 'IMPORT_ALREADY_CONFIRMED' } });
  }

  await c.var.db.update(importSessions).set({ status: 'VALIDATING' }).where(eq(importSessions.id, id));

  const stored = await c.var.db.select().from(importRows).where(eq(importRows.importSessionId, id));
  const validated = await validateRows(
    c.var.db,
    session.type as ImportType,
    stored.map((r) => ({ rowNumber: r.rowNumber, data: r.rawData as Record<string, string> })),
  );

  for (const row of validated) {
    await c.var.db
      .update(importRows)
      .set({
        normalizedData: row.normalized,
        status: row.status,
        errors: row.errors,
        warnings: row.warnings,
        resolvedEntityId: row.existingId,
        resolution: row.resolution ?? null,
      })
      .where(and(eq(importRows.importSessionId, id), eq(importRows.rowNumber, row.rowNumber)));
  }

  const summary = summarise(validated);
  await c.var.db
    .update(importSessions)
    .set({
      status: 'PREVIEW_READY',
      validCount: summary.valid + summary.warnings,
      invalidCount: summary.invalid,
      warningCount: summary.warnings,
      summary,
    })
    .where(eq(importSessions.id, id));

  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'import.validate',
    resourceType: 'import_session',
    resourceId: id,
    after: summary,
    requestId: c.var.requestId,
  });

  return c.json({ data: { id, status: 'PREVIEW_READY', summary }, requestId: c.var.requestId });
});

/* ------------------------------ preview read ----------------------------- */

importRoutes.get('/imports', manage, async (c) => {
  const rows = await c.var.db.select().from(importSessions).orderBy(desc(importSessions.createdAt)).limit(50);
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

importRoutes.get('/imports/:id', manage, async (c) => {
  const id = idParam(c);
  const [session] = await c.var.db.select().from(importSessions).where(eq(importSessions.id, id)).limit(1);
  if (!session) throw new HTTPException(404, { message: 'Sesi import tidak dijumpai.', cause: { code: 'IMPORT_SESSION_NOT_FOUND' } });
  const rows = await c.var.db.select().from(importRows).where(eq(importRows.importSessionId, id)).orderBy(importRows.rowNumber);
  return c.json({ data: { ...session, rows }, requestId: c.var.requestId });
});

/* ----------------------------- resolution -------------------------------- */

/** Explicit conflict resolution; enrollment conflicts are never moved silently (§16, §24). */
importRoutes.post('/imports/:id/resolutions', manage, async (c) => {
  const id = idParam(c);
  const { rows } = parse(resolutionInput, await c.req.json().catch(() => ({})));
  const [session] = await c.var.db.select({ status: importSessions.status }).from(importSessions).where(eq(importSessions.id, id)).limit(1);
  if (!session) throw new HTTPException(404, { message: 'Sesi import tidak dijumpai.', cause: { code: 'IMPORT_SESSION_NOT_FOUND' } });
  if (session.status !== 'PREVIEW_READY') {
    throw new HTTPException(409, { message: 'Pratonton belum sedia.', cause: { code: 'IMPORT_STALE_PREVIEW' } });
  }
  for (const row of rows) {
    await c.var.db
      .update(importRows)
      .set({ resolution: row.resolution })
      .where(and(eq(importRows.importSessionId, id), eq(importRows.rowNumber, row.rowNumber)));
  }
  return c.json({ data: { updated: rows.length }, requestId: c.var.requestId });
});

/* -------------------------------- confirm -------------------------------- */

importRoutes.post('/imports/:id/confirm', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const result = await commitImport(c.var.db, id, actor.profileId);
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'import.complete',
    resourceType: 'import_session',
    resourceId: id,
    after: result,
    requestId: c.var.requestId,
  });
  return c.json({ data: { id, ...result }, requestId: c.var.requestId });
});

importRoutes.post('/imports/:id/cancel', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [session] = await c.var.db.select({ status: importSessions.status }).from(importSessions).where(eq(importSessions.id, id)).limit(1);
  if (!session) throw new HTTPException(404, { message: 'Sesi import tidak dijumpai.', cause: { code: 'IMPORT_SESSION_NOT_FOUND' } });
  if (session.status === 'COMPLETED') {
    throw new HTTPException(409, { message: 'Sesi yang telah selesai tidak boleh dibatalkan.', cause: { code: 'IMPORT_ALREADY_CONFIRMED' } });
  }
  await c.var.db.update(importSessions).set({ status: 'CANCELLED' }).where(eq(importSessions.id, id));
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'import.cancel',
    resourceType: 'import_session',
    resourceId: id,
    requestId: c.var.requestId,
  });
  return c.json({ data: { id, status: 'CANCELLED' }, requestId: c.var.requestId });
});

/* ------------------------------- templates ------------------------------- */

importRoutes.get('/imports/templates/:type', manage, async (c) => {
  const type = parse(typeSchema, c.req.param('type'));
  const buffer = await buildTemplateWorkbook(type as ImportType);
  const filename = IMPORT_SPECS[type as ImportType].filename;
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(new Uint8Array(buffer));
});
