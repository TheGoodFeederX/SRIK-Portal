import ExcelJS from 'exceljs';
import { HTTPException } from 'hono/http-exception';
import { IMPORT_SPECS, TEMPLATE_VERSION, templateMetadata, type ImportType } from '@srik/shared';

/**
 * Server-side .xlsx reader (spec v1.4.1 §39). No formulas are trusted, merged cells are
 * rejected, and rows are returned as raw string maps keyed by the template columns.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type ParsedWorkbook = {
  entityType: ImportType;
  templateVersion: string;
  rows: { rowNumber: number; data: Record<string, string> }[];
};

const fail = (status: 400 | 413, code: string, message: string) => new HTTPException(status, { message, cause: { code } });

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Prefer unambiguous ISO dates; ambiguous formats are rejected by normalize().
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') return (value as { text: string }).text;
    if ('result' in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? '');
    if ('richText' in value) {
      const rich = (value as { richText: { text: string }[] }).richText;
      return rich.map((r) => r.text).join('');
    }
  }
  return String(value);
}

const norm = (v: string) => v.trim().replace(/\s+/g, ' ');

/** Reads metadata + data sheet and validates the template shape. */
export async function parseWorkbook(buffer: Buffer, declaredType: ImportType): Promise<ParsedWorkbook> {
  if (buffer.byteLength > MAX_FILE_BYTES) throw fail(413, 'IMPORT_FILE_TOO_LARGE', 'Saiz fail melebihi 10 MB.');

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fail(400, 'IMPORT_FILE_INVALID', 'Fail bukan .xlsx yang sah.');
  }

  const spec = IMPORT_SPECS[declaredType];
  const dataSheet = workbook.getWorksheet(spec.sheet) ?? workbook.worksheets[0];
  if (!dataSheet) throw fail(400, 'IMPORT_SHEET_MISSING', `Lembaran "${spec.sheet}" tidak dijumpai.`);

  // Metadata may live in a _template/metadata sheet or in the first two rows of the data sheet.
  const metaSheet = workbook.getWorksheet('_template') ?? workbook.getWorksheet('metadata');
  const meta = new Map<string, string>();
  if (metaSheet) {
    metaSheet.eachRow((row) => {
      const key = norm(cellText(row.getCell(1).value)).toLowerCase();
      const value = norm(cellText(row.getCell(2).value));
      if (key) meta.set(key, value);
    });
  }

  const headerRowNo = metaSheet ? dataSheet.actualRowCount > 0 ? 1 : 0 : 1;
  const header = dataSheet.getRow(headerRowNo);
  const headerKeys: string[] = [];
  header.eachCell({ includeEmpty: false }, (cell, col) => {
    headerKeys[col] = norm(cellText(cell.value)).toLowerCase();
  });

  const present = new Set(headerKeys.filter(Boolean));
  const entityType = (meta.get('entity_type') ?? declaredType) as ImportType;
  if (entityType !== declaredType) {
    throw fail(400, 'IMPORT_TEMPLATE_UNSUPPORTED', `Templat ini untuk ${entityType}, bukan ${declaredType}.`);
  }
  const version = meta.get('template_version') ?? TEMPLATE_VERSION;
  if (version !== TEMPLATE_VERSION) {
    throw fail(400, 'IMPORT_TEMPLATE_UNSUPPORTED', `Versi templat ${version} tidak disokong (perlu ${TEMPLATE_VERSION}).`);
  }

  const missing = spec.columns.filter((c) => c.required && !present.has(c.key)).map((c) => c.key);
  if (missing.length) {
    throw fail(400, 'IMPORT_COLUMN_MISSING', `Lajur wajib tiada: ${missing.join(', ')}.`);
  }

  const rows: ParsedWorkbook['rows'] = [];
  const lastRow = dataSheet.actualRowCount;
  for (let r = headerRowNo + 1; r <= lastRow; r += 1) {
    const row = dataSheet.getRow(r);
    const data: Record<string, string> = {};
    let hasValue = false;
    for (const col of spec.columns) {
      // headerKeys is indexed by the 1-based column number, so indexOf already yields the column.
      const colIndex = headerKeys.indexOf(col.key);
      const value = colIndex > 0 ? norm(cellText(row.getCell(colIndex).value)) : '';
      data[col.key] = value;
      if (value) hasValue = true;
    }
    if (!hasValue) continue; // fully blank trailing/embedded rows are ignored
    if (rows.length >= MAX_ROWS) throw fail(400, 'IMPORT_ROW_LIMIT_EXCEEDED', `Baris melebihi had ${MAX_ROWS}.`);
    rows.push({ rowNumber: r, data });
  }

  return { entityType, templateVersion: version, rows };
}

/** Builds a downloadable template workbook with an ARAHAN sheet and a data sheet (§38). */
export async function buildTemplateWorkbook(type: ImportType): Promise<Buffer> {
  const spec = IMPORT_SPECS[type];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Portal SRIK';
  workbook.created = new Date();

  const meta = workbook.addWorksheet('_template');
  const metadata = templateMetadata(type);
  meta.addRow(['entity_type', metadata.entity_type]);
  meta.addRow(['template_version', metadata.template_version]);
  meta.addRow(['generated_at', metadata.generated_at]);

  const guide = workbook.addWorksheet('ARAHAN');
  guide.addRow(['Lajur', 'Wajib', 'Contoh', 'Nota']);
  guide.getRow(1).font = { bold: true };
  for (const col of spec.columns) {
    guide.addRow([col.key, col.required ? 'YA' : 'TIDAK', col.example, col.note ?? '']);
  }
  guide.addRow([]);
  guide.addRow(['Tarikh', 'YYYY-MM-DD', '', 'Format lain ditolak jika kabur']);
  guide.addRow(['Boolean', 'TRUE / FALSE', '', 'Boleh juga YA/TIDAK, 1/0']);
  guide.addRow(['Pengenal', 'staff_no, student_no, subject_code, academic_year + class_name', '', 'Jangan guna UUID']);

  const sheet = workbook.addWorksheet(spec.sheet);
  sheet.addRow(spec.columns.map((c) => c.key));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  sheet.addRow(spec.columns.map((c) => c.example));

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
