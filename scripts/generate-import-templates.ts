/**
 * Generates the six official import workbooks into docs/releases/v1.4.1/templates/.
 *
 * Uses the same builder as `GET /api/v1/imports/templates/:type`, so the files can never drift
 * from what the API accepts. A `RUJUKAN` sheet is appended with the identifiers that already
 * exist in the database, which is what fillers must reference.
 *
 *   DATABASE_URL=<production or dev> node --experimental-strip-types scripts/generate-import-templates.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { asc, eq } from 'drizzle-orm';
import { academicYears, classes, createDb, staff, subjects } from '../packages/db/src/index.ts';
import { IMPORT_SPECS, IMPORT_TYPES, type ImportType } from '../packages/shared/src/index.ts';
import { buildTemplateWorkbook } from '../apps/web/src/server/services/imports/parser.ts';

const OUT_DIR = new URL('../docs/releases/v1.4.1/templates/', import.meta.url);
const db = createDb();

async function referenceSheets(): Promise<Record<ImportType, (string | number)[][]>> {
  const years = await db.select({ name: academicYears.name, status: academicYears.status }).from(academicYears).orderBy(asc(academicYears.startDate));
  const classRows = await db
    .select({ name: classes.name, year: academicYears.name, level: classes.yearLevel })
    .from(classes)
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .orderBy(asc(academicYears.name), asc(classes.name));
  const staffRows = await db.select({ no: staff.staffNo, name: staff.fullName }).from(staff).orderBy(asc(staff.staffNo));
  const subjectRows = await db.select({ code: subjects.code, name: subjects.nameMs }).from(subjects).orderBy(asc(subjects.code));

  const yearRows: (string | number)[][] = [['academic_year', 'status'], ...years.map((y) => [y.name, y.status])];
  const classTable: (string | number)[][] = [['academic_year', 'class_name', 'year_level'], ...classRows.map((c) => [String(c.year ?? ''), c.name, c.level])];
  const staffTable: (string | number)[][] = [['staff_no', 'full_name'], ...staffRows.map((s) => [s.no, s.name])];
  const subjectTable: (string | number)[][] = [['subject_code', 'name_ms'], ...subjectRows.map((s) => [s.code, s.name])];

  return {
    STAFF: staffTable,
    STUDENTS: [['nota', 'Pengenal: student_no (unik). Murid baharu perlukan gender + date_of_birth.']],
    CLASSES: [...yearRows, [], ...staffTable],
    SUBJECTS: subjectTable,
    ENROLLMENTS: [...yearRows, [], ...classTable],
    ASSIGNMENTS: [...yearRows, [], ...classTable, [], ...staffTable, [], ...subjectTable],
  };
}

const sheetName = (type: ImportType) => `RUJUKAN_${type}`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const reference = await referenceSheets();

  for (const type of IMPORT_TYPES) {
    const buffer = await buildTemplateWorkbook(type);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    // Strip the single example row so a fill-in file cannot import demo data by accident.
    const dataSheet = workbook.getWorksheet(IMPORT_SPECS[type].sheet);
    const exampleRow = IMPORT_SPECS[type].columns.map((c) => c.example).join('|');
    if (dataSheet) {
      for (let r = dataSheet.actualRowCount; r > 1; r -= 1) {
        const values = (dataSheet.getRow(r).values as unknown as (string | undefined)[]).slice(1).map((v) => String(v ?? ''));
        if (values.join('|') === exampleRow) dataSheet.spliceRows(r, 1);
      }
    }

    const sheet = workbook.addWorksheet(sheetName(type));
    sheet.addRow(['Rujukan data sedia ada — jangan ubah helaian ini, ia tidak diimport.']);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([]);
    for (const row of reference[type]) sheet.addRow(row);
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 28;
    sheet.getColumn(3).width = 14;

    const out = await workbook.xlsx.writeBuffer();
    const file = new URL(IMPORT_SPECS[type].filename, OUT_DIR);
    await writeFile(file, Buffer.from(out));
    console.log(`wrote ${IMPORT_SPECS[type].filename} (${Buffer.from(out).byteLength} bytes)`);
  }

  process.exit(0);
}

await main();
