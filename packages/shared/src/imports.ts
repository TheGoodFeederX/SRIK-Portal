/** Import entity metadata shared by the API, the parser and the UI (spec v1.4.1 §11, §47). */

export const IMPORT_TYPES = ['STAFF', 'STUDENTS', 'CLASSES', 'SUBJECTS', 'ENROLLMENTS', 'ASSIGNMENTS'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const TEMPLATE_VERSION = '1.0';

export type ColumnSpec = {
  key: string;
  required: boolean;
  /** Example value shown in the generated template/instruction sheet. */
  example: string;
  note?: string;
};

export type ImportSpec = {
  type: ImportType;
  /** Sheet name holding the rows. */
  sheet: string;
  labelMs: string;
  filename: string;
  columns: ColumnSpec[];
};

export const IMPORT_SPECS: Record<ImportType, ImportSpec> = {
  STAFF: {
    type: 'STAFF',
    sheet: 'STAFF',
    labelMs: 'Guru & Staf',
    filename: 'SRIK_IMPORT_STAFF.xlsx',
    columns: [
      { key: 'staff_no', required: true, example: 'G001', note: 'Unik' },
      { key: 'full_name', required: true, example: 'Ustaz Ahmad bin Ali' },
      { key: 'email_alias', required: false, example: 'ahmad@srik.local' },
      { key: 'phone', required: false, example: '0123456789' },
      { key: 'position', required: false, example: 'GURU' },
      { key: 'employment_status', required: false, example: 'ACTIVE', note: 'ACTIVE | RESIGNED | RETIRED' },
    ],
  },
  STUDENTS: {
    type: 'STUDENTS',
    sheet: 'STUDENTS',
    labelMs: 'Murid',
    filename: 'SRIK_IMPORT_STUDENTS.xlsx',
    columns: [
      { key: 'student_no', required: true, example: 'M001', note: 'Unik' },
      { key: 'full_name', required: true, example: 'Muhammad Ali bin Hassan' },
      { key: 'gender', required: false, example: 'MALE', note: 'MALE | FEMALE' },
      { key: 'date_of_birth', required: false, example: '2017-05-10', note: 'YYYY-MM-DD' },
      { key: 'status', required: false, example: 'ACTIVE', note: 'ACTIVE | GRADUATED | TRANSFERRED | WITHDRAWN' },
    ],
  },
  CLASSES: {
    type: 'CLASSES',
    sheet: 'CLASSES',
    labelMs: 'Kelas',
    filename: 'SRIK_IMPORT_CLASSES.xlsx',
    columns: [
      { key: 'academic_year', required: true, example: '2026/2027', note: 'Mesti wujud' },
      { key: 'year_level', required: true, example: '1', note: '1–6' },
      { key: 'class_name', required: true, example: '1 Al-Junaidi' },
      { key: 'class_teacher_staff_no', required: false, example: 'G001' },
      { key: 'status', required: false, example: 'ACTIVE', note: 'ACTIVE | ARCHIVED' },
    ],
  },
  SUBJECTS: {
    type: 'SUBJECTS',
    sheet: 'SUBJECTS',
    labelMs: 'Subjek',
    filename: 'SRIK_IMPORT_SUBJECTS.xlsx',
    columns: [
      { key: 'subject_code', required: true, example: 'BM', note: 'Huruf besar, unik' },
      { key: 'name_ms', required: true, example: 'Bahasa Melayu' },
      { key: 'name_en', required: false, example: 'Malay Language' },
      { key: 'is_active', required: false, example: 'TRUE', note: 'TRUE | FALSE' },
    ],
  },
  ENROLLMENTS: {
    type: 'ENROLLMENTS',
    sheet: 'ENROLLMENTS',
    labelMs: 'Keahlian Kelas',
    filename: 'SRIK_IMPORT_ENROLLMENTS.xlsx',
    columns: [
      { key: 'academic_year', required: true, example: '2026/2027' },
      { key: 'student_no', required: true, example: 'M001' },
      { key: 'class_name', required: true, example: '1 Al-Junaidi' },
      { key: 'status', required: false, example: 'ACTIVE', note: 'ACTIVE | TRANSFERRED | WITHDRAWN | COMPLETED' },
      { key: 'enrolled_at', required: false, example: '2026-01-05', note: 'YYYY-MM-DD' },
    ],
  },
  ASSIGNMENTS: {
    type: 'ASSIGNMENTS',
    sheet: 'ASSIGNMENTS',
    labelMs: 'Agihan Pengajaran',
    filename: 'SRIK_IMPORT_ASSIGNMENTS.xlsx',
    columns: [
      { key: 'academic_year', required: true, example: '2026/2027' },
      { key: 'teacher_staff_no', required: true, example: 'G001' },
      { key: 'class_name', required: true, example: '1 Al-Junaidi' },
      { key: 'subject_code', required: true, example: 'BM' },
      { key: 'is_primary', required: false, example: 'FALSE', note: 'TRUE | FALSE' },
    ],
  },
};

export const templateMetadata = (type: ImportType) => ({
  entity_type: type,
  template_version: TEMPLATE_VERSION,
  generated_at: new Date().toISOString(),
});

/** Row state used by the preview (spec §7, §9). */
export type ImportRowStatus = 'VALID' | 'WARNING' | 'INVALID' | 'DUPLICATE' | 'CONFLICT' | 'IMPORTED' | 'SKIPPED';

export type RowIssue = { column?: string; code: string; message: string; severity: 'ERROR' | 'WARNING' | 'INFO' };
