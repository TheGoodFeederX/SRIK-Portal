import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import {
  academicYears,
  classes,
  createDb,
  enrollments,
  importRows,
  importSessions,
  profiles,
  staff,
  students,
  subjects,
  teachingAssignments,
} from '@srik/db';
import { parseWorkbook, buildTemplateWorkbook } from './services/imports/parser.ts';
import { validateAssignmentRows, validateEnrollmentRows, validateStaffRows, validateStudentRows, validateSubjectRows } from './services/imports/validate.ts';
import { commitImport } from './services/imports/commit.ts';

/**
 * v1.4.1 import pipeline (spec §49–§52). Parser tests run without a database; entity and
 * transaction tests need the dev branch:
 *   SRIK_INTEGRATION=1 DATABASE_URL=<dev branch> node --test src/server/imports.test.ts
 */
const url = process.env.DATABASE_URL;
const enabled = Boolean(url) && process.env.SRIK_INTEGRATION === '1';
const run = enabled ? test : test.skip;
const db = url ? createDb(url) : (null as never);
const tag = randomUUID().slice(0, 8);

const workbook = async (type: string, header: string[], rows: string[][], version = '1.0') => {
  const wb = new ExcelJS.Workbook();
  const meta = wb.addWorksheet('_template');
  meta.addRow(['entity_type', type]);
  meta.addRow(['template_version', version]);
  const ws = wb.addWorksheet(type);
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const STAFF_HEADER = ['staff_no', 'full_name', 'email_alias', 'phone', 'position', 'employment_status'];

/* -------------------------------- parser -------------------------------- */

test('valid workbook parses rows in column order', async () => {
  const buf = await workbook('STAFF', STAFF_HEADER, [['G900', 'Guru Ujian', 'G900@srik.local', '', 'GURU', 'ACTIVE']]);
  const parsed = await parseWorkbook(buf, 'STAFF');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.data.staff_no, 'G900');
  assert.equal(parsed.rows[0]!.data.full_name, 'Guru Ujian');
  assert.equal(parsed.rows[0]!.data.email_alias, 'G900@srik.local');
});

test('blank trailing rows are ignored and partial rows kept', async () => {
  const buf = await workbook('STAFF', STAFF_HEADER, [['G901', 'A'], ['', '', '', '', '', ''], ['G902', '']]);
  const parsed = await parseWorkbook(buf, 'STAFF');
  assert.equal(parsed.rows.length, 2);
});

test('missing required column is rejected', async () => {
  const buf = await workbook('STAFF', ['full_name'], [['Tanpa No']]);
  await assert.rejects(parseWorkbook(buf, 'STAFF'), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_COLUMN_MISSING');
});

test('unsupported template version is rejected', async () => {
  const buf = await workbook('STAFF', STAFF_HEADER, [['G903', 'X']], '0.9');
  await assert.rejects(parseWorkbook(buf, 'STAFF'), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_TEMPLATE_UNSUPPORTED');
});

test('entity mismatch (wrong template) is rejected', async () => {
  const buf = await workbook('SUBJECTS', ['subject_code', 'name_ms'], [['BM', 'Bahasa Melayu']]);
  await assert.rejects(parseWorkbook(buf, 'STAFF'), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_TEMPLATE_UNSUPPORTED');
});

test('non-xlsx buffer is rejected', async () => {
  await assert.rejects(parseWorkbook(Buffer.from('not a workbook'), 'STAFF'), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_FILE_INVALID');
});

test('generated template round-trips through the parser', async () => {
  const buf = await buildTemplateWorkbook('SUBJECTS');
  const parsed = await parseWorkbook(buf, 'SUBJECTS');
  assert.equal(parsed.entityType, 'SUBJECTS');
  assert.ok(parsed.rows.length >= 1, 'example row present');
});

/* ---------------------------- entity validation ---------------------------- */

run('staff rows: duplicates and missing name', async () => {
  const rows = await validateStaffRows(db, [
    { rowNumber: 2, data: { staff_no: `S${tag}`, full_name: 'Guru Satu' } },
    { rowNumber: 3, data: { staff_no: `S${tag}`, full_name: 'Guru Dua' } },
    { rowNumber: 4, data: { staff_no: `S2${tag}`, full_name: '' } },
  ]);
  assert.equal(rows[0]!.status, 'VALID');
  assert.equal(rows[1]!.status, 'INVALID');
  assert.equal(rows[2]!.status, 'INVALID');
});

run('student rows require gender and DOB for new records', async () => {
  const rows = await validateStudentRows(db, [
    { rowNumber: 2, data: { student_no: `M${tag}`, full_name: 'Murid Satu' } },
    { rowNumber: 3, data: { student_no: `M2${tag}`, full_name: 'Murid Dua', gender: 'MALE', date_of_birth: '2017-01-01' } },
    { rowNumber: 4, data: { student_no: `M3${tag}`, full_name: 'Murid Tiga', gender: 'MALE', date_of_birth: '01/01/2017' } },
  ]);
  assert.equal(rows[0]!.status, 'INVALID');
  assert.equal(rows[1]!.status, 'VALID');
  assert.equal(rows[2]!.status, 'INVALID', 'ambiguous date rejected');
});

run('subject codes are uppercased and unique', async () => {
  const [row] = await validateSubjectRows(db, [{ rowNumber: 2, data: { subject_code: `zz${tag}`, name_ms: 'Subjek Ujian' } }]);
  assert.equal(row!.normalized.code, `ZZ${tag}`.toUpperCase());
  assert.equal(row!.status, 'VALID');
});

run('enrollment conflict never moves a student silently', async () => {
  const [year] = await db
    .insert(academicYears)
    .values({ name: `IMP-${tag}`, startDate: '2026-01-04', endDate: '2026-11-19', isCurrent: false, status: 'ACTIVE' })
    .returning({ id: academicYears.id });
  const [c1] = await db.insert(classes).values({ academicYearId: year!.id, yearLevel: 1, name: `I1-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  const [c2] = await db.insert(classes).values({ academicYearId: year!.id, yearLevel: 1, name: `I2-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  const [st] = await db
    .insert(students)
    .values({ studentNo: `IM${tag}`, fullName: 'Murid Import', gender: 'MALE', dateOfBirth: '2017-01-01', enrollmentDate: '2026-01-05', status: 'ACTIVE' })
    .returning({ id: students.id });
  await db.insert(enrollments).values({ studentId: st!.id, classId: c1!.id, academicYearId: year!.id, enrolledAt: '2026-01-05', status: 'ACTIVE' });

  const [same] = await validateEnrollmentRows(db, [
    { rowNumber: 2, data: { academic_year: `IMP-${tag}`, student_no: `IM${tag}`, class_name: `I1-${tag}` } },
  ]);
  assert.equal(same!.status, 'DUPLICATE');

  const [other] = await validateEnrollmentRows(db, [
    { rowNumber: 3, data: { academic_year: `IMP-${tag}`, student_no: `IM${tag}`, class_name: `I2-${tag}` } },
  ]);
  assert.equal(other!.status, 'CONFLICT');
  assert.equal(other!.resolution, 'SKIP');
});

run('assignment validation rejects inactive subject and missing teacher', async () => {
  const [year] = await db
    .insert(academicYears)
    .values({ name: `IMP2-${tag}`, startDate: '2026-01-04', endDate: '2026-11-19', isCurrent: false, status: 'ACTIVE' })
    .returning({ id: academicYears.id });
  await db.insert(classes).values({ academicYearId: year!.id, yearLevel: 2, name: `J1-${tag}`, status: 'ACTIVE' });
  const [sub] = await db.insert(subjects).values({ code: `OFF${tag}`, nameMs: 'Subjek Mati', isActive: false }).returning({ id: subjects.id });
  assert.ok(sub);

  const [row] = await validateAssignmentRows(db, [
    { rowNumber: 2, data: { academic_year: `IMP2-${tag}`, teacher_staff_no: 'TIADA', class_name: `J1-${tag}`, subject_code: `OFF${tag}` } },
  ]);
  assert.equal(row!.status, 'INVALID');
  assert.ok(row!.errors.some((e) => e.code === 'INVALID_TEACHER'));
  assert.ok(row!.errors.some((e) => e.code === 'SUBJECT_INACTIVE'));
});

/* ------------------------------ transactions ------------------------------ */

async function sessionFor(type: 'STAFF', rows: { rowNumber: number; data: Record<string, string> }[], status: 'PREVIEW_READY' | 'COMPLETED' = 'PREVIEW_READY') {
  const [profile] = await db
    .insert(profiles)
    .values({ email: `imp-${randomUUID()}@srik.test`, displayName: 'Importer', status: 'ACTIVE', authUserId: randomUUID() })
    .returning({ id: profiles.id });
  const [session] = await db
    .insert(importSessions)
    .values({ type, filename: 'test.xlsx', uploadedBy: profile!.id, rowCount: rows.length, status })
    .returning();
  await db.insert(importRows).values(
    rows.map((r) => ({ importSessionId: session!.id, rowNumber: r.rowNumber, rawData: r.data, status: 'VALID' as const })),
  );
  return session!;
}

run('all valid rows commit atomically', async () => {
  const session = await sessionFor('STAFF', [
    { rowNumber: 2, data: { staff_no: `TX1${tag}`, full_name: 'Transaksi Satu' } },
    { rowNumber: 3, data: { staff_no: `TX2${tag}`, full_name: 'Transaksi Dua' } },
  ]);
  const result = await commitImport(db, session.id, session.uploadedBy);
  assert.deepEqual(result, { imported: 2, skipped: 0, status: 'COMPLETED' });
  const created = await db.select({ staffNo: staff.staffNo }).from(staff).where(eq(staff.staffNo, `TX1${tag}`));
  assert.equal(created.length, 1);
});

run('double confirm is rejected', async () => {
  const session = await sessionFor('STAFF', [{ rowNumber: 2, data: { staff_no: `TX3${tag}`, full_name: 'Sekali Sahaja' } }]);
  await commitImport(db, session.id, session.uploadedBy);
  await assert.rejects(commitImport(db, session.id, session.uploadedBy), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_ALREADY_CONFIRMED');
});

run('stale preview is rejected when the DB changed after validation', async () => {
  // Session rows already exist in DB, so a fresh validation marks them DUPLICATE.
  const staffNo = `TX4${tag}`;
  await db.insert(staff).values({ staffNo, fullName: 'Pra-Wujud', joinDate: '2026-01-05' });
  const session = await sessionFor('STAFF', [{ rowNumber: 2, data: { staff_no: staffNo, full_name: 'Pra-Wujud' } }]);
  await assert.rejects(commitImport(db, session.id, session.uploadedBy), (err: { cause?: { code?: string } }) => err.cause?.code === 'IMPORT_STALE_PREVIEW');
});

run('duplicate rows are skipped, not imported twice', async () => {
  const staffNo = `TX5${tag}`;
  await db.insert(staff).values({ staffNo, fullName: 'Sedia Ada', joinDate: '2026-01-05' });
  const session = await sessionFor('STAFF', [
    { rowNumber: 2, data: { staff_no: staffNo, full_name: 'Sedia Ada' } },
    { rowNumber: 3, data: { staff_no: `TX6${tag}`, full_name: 'Baharu' } },
  ]);
  // Mark the first row as a known duplicate so drift detection does not fire.
  await db.update(importRows).set({ status: 'DUPLICATE', resolution: 'SKIP' }).where(eq(importRows.rowNumber, 2));
  const result = await commitImport(db, session.id, session.uploadedBy);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  const rows = await db.select({ staffNo: staff.staffNo }).from(staff).where(eq(staff.staffNo, staffNo));
  assert.equal(rows.length, 1);
});

after(async () => {
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
