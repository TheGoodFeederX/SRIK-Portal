import { HTTPException } from 'hono/http-exception';
import { and, eq } from 'drizzle-orm';
import {
  classes,
  enrollments,
  importRows,
  importSessions,
  staff,
  students,
  subjects,
  teachingAssignments,
  type Db,
} from '@srik/db';
import type { ImportType } from '@srik/shared';
import { validateRows, type ValidatedRow } from './validate.ts';

/**
 * Transactional commit for a validated import session (spec v1.4.1 §26–§27).
 * One session = one transaction: any unexpected failure rolls everything back, and the
 * session is only marked COMPLETED after every selected row was applied.
 */

const fail = (status: 400 | 404 | 409 | 500, code: string, message: string) =>
  new HTTPException(status, { message, cause: { code } });

export const today = () => new Date().toISOString().slice(0, 10);

/** Rows that will be applied: VALID/WARNING opted in, DUPLICATE skipped, CONFLICT per resolution. */
export function selectableRows(type: ImportType, rows: ValidatedRow[]): ValidatedRow[] {
  return rows.filter((r) => {
    if (r.status === 'INVALID') return false;
    if (r.status === 'DUPLICATE') return false;
    if (r.status === 'CONFLICT') return r.resolution === 'REPLACE';
    return true;
  });
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function applyRow(tx: Tx, type: ImportType, row: ValidatedRow): Promise<string | null> {
  const n = row.normalized as Record<string, string | null | boolean>;

  if (type === 'STAFF') {
    const [inserted] = await tx
      .insert(staff)
      .values({
        staffNo: String(n.staffNo),
        fullName: String(n.fullName),
        email: (n.email as string | null) ?? null,
        phone: (n.phone as string | null) ?? null,
        employmentStatus: String(n.employmentStatus ?? 'ACTIVE'),
        employmentType: 'PERMANENT',
        joinDate: today(),
      })
      .returning({ id: staff.id });
    return inserted?.id ?? null;
  }

  if (type === 'STUDENTS') {
    const [inserted] = await tx
      .insert(students)
      .values({
        studentNo: String(n.studentNo),
        fullName: String(n.fullName),
        gender: (n.gender as 'MALE' | 'FEMALE') ?? 'MALE',
        dateOfBirth: String(n.dateOfBirth),
        status: (n.status as 'ACTIVE') ?? 'ACTIVE',
        enrollmentDate: today(),
      })
      .returning({ id: students.id });
    return inserted?.id ?? null;
  }

  if (type === 'CLASSES') {
    const [inserted] = await tx
      .insert(classes)
      .values({
        academicYearId: String(n.academicYearId),
        yearLevel: Number(n.yearLevel),
        name: String(n.name),
        classTeacherId: (n.classTeacherId as string | null) ?? null,
        status: (n.status as 'ACTIVE') ?? 'ACTIVE',
      })
      .returning({ id: classes.id });
    return inserted?.id ?? null;
  }

  if (type === 'SUBJECTS') {
    const [inserted] = await tx
      .insert(subjects)
      .values({
        code: String(n.code),
        nameMs: String(n.nameMs),
        nameEn: (n.nameEn as string | null) ?? null,
        isActive: Boolean(n.isActive ?? true),
      })
      .returning({ id: subjects.id });
    return inserted?.id ?? null;
  }

  if (type === 'ENROLLMENTS') {
    if (row.status === 'CONFLICT' && row.resolution === 'REPLACE' && row.existingId) {
      const [updated] = await tx
        .update(enrollments)
        .set({ classId: String(n.classId), status: (n.status as 'ACTIVE') ?? 'ACTIVE', leftAt: null })
        .where(eq(enrollments.id, row.existingId))
        .returning({ id: enrollments.id });
      return updated?.id ?? null;
    }
    const [inserted] = await tx
      .insert(enrollments)
      .values({
        studentId: String(n.studentId),
        classId: String(n.classId),
        academicYearId: String(n.academicYearId),
        enrolledAt: (n.enrolledAt as string | null) ?? today(),
        status: (n.status as 'ACTIVE') ?? 'ACTIVE',
      })
      .returning({ id: enrollments.id });
    return inserted?.id ?? null;
  }

  if (type === 'ASSIGNMENTS') {
    const [inserted] = await tx
      .insert(teachingAssignments)
      .values({
        academicYearId: String(n.academicYearId),
        teacherId: String(n.teacherId),
        classId: String(n.classId),
        subjectId: String(n.subjectId),
        isPrimary: Boolean(n.isPrimary ?? false),
      })
      .returning({ id: teachingAssignments.id });
    return inserted?.id ?? null;
  }

  return null;
}

export type CommitResult = { imported: number; skipped: number; status: 'COMPLETED' };

export async function commitImport(db: Db, sessionId: string, actorId: string): Promise<CommitResult> {
  const [session] = await db.select().from(importSessions).where(eq(importSessions.id, sessionId)).limit(1);
  if (!session) throw fail(404, 'IMPORT_SESSION_NOT_FOUND', 'Sesi import tidak dijumpai.');
  if (session.status === 'COMPLETED' || session.status === 'CONFIRMED' || session.status === 'PROCESSING') {
    throw fail(409, 'IMPORT_ALREADY_CONFIRMED', 'Sesi import ini telah disahkan.');
  }
  if (session.status !== 'PREVIEW_READY') throw fail(409, 'IMPORT_STALE_PREVIEW', 'Sesi import perlu divalidasi semula.');

  const storedRows = await db.select().from(importRows).where(eq(importRows.importSessionId, sessionId));
  const type = session.type as ImportType;

  // Drift detection: revalidate against current DB state before writing (§26).
  const fresh = await validateRows(
    db,
    type,
    storedRows.map((r) => ({ rowNumber: r.rowNumber, data: r.rawData as Record<string, string> })),
  );
  const drift = fresh.some((row) => {
    const stored = storedRows.find((s) => s.rowNumber === row.rowNumber);
    return stored && stored.status !== row.status && (row.status === 'DUPLICATE' || row.status === 'CONFLICT');
  });
  if (drift) {
    await db.update(importSessions).set({ status: 'PREVIEW_READY' }).where(eq(importSessions.id, sessionId));
    throw fail(409, 'IMPORT_STALE_PREVIEW', 'Data telah berubah sejak pratonton. Jalankan semula pengesahan.');
  }

  const resolutions = new Map(storedRows.map((r) => [r.rowNumber, (r.resolution as 'SKIP' | 'REPLACE' | null) ?? null]));
  const rows = fresh.map((r) => ({ ...r, resolution: resolutions.get(r.rowNumber) ?? r.resolution ?? null }));
  const toApply = selectableRows(type, rows);
  const skipped = rows.length - toApply.length;

  await db.update(importSessions).set({ status: 'PROCESSING', confirmedAt: new Date() }).where(eq(importSessions.id, sessionId));

  try {
    await db.transaction(async (tx) => {
      for (const row of toApply) {
        const entityId = await applyRow(tx, type, row);
        await tx
          .update(importRows)
          .set({ status: 'IMPORTED', resolvedEntityId: entityId })
          .where(and(eq(importRows.importSessionId, sessionId), eq(importRows.rowNumber, row.rowNumber)));
      }
      for (const row of rows.filter((r) => !toApply.includes(r))) {
        await tx
          .update(importRows)
          .set({ status: 'SKIPPED' })
          .where(and(eq(importRows.importSessionId, sessionId), eq(importRows.rowNumber, row.rowNumber)));
      }
      await tx
        .update(importSessions)
        .set({ status: 'COMPLETED', completedAt: new Date(), summary: { imported: toApply.length, skipped } })
        .where(eq(importSessions.id, sessionId));
    });
  } catch (error) {
    await db.update(importSessions).set({ status: 'FAILED', failedAt: new Date() }).where(eq(importSessions.id, sessionId));
    console.error(JSON.stringify({ level: 'error', message: 'import failed', sessionId, actorId, error: (error as Error).message }));
    throw fail(500, 'IMPORT_TRANSACTION_FAILED', 'Import gagal dan telah dibatalkan sepenuhnya.');
  }

  return { imported: toApply.length, skipped, status: 'COMPLETED' };
}
