import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  academicYears,
  classes,
  enrollments,
  examMarks,
  examSubjects,
  exams,
  staff,
  students,
  subjects,
  teachingAssignments,
  type Db,
} from '@srik/db';
import type { ApplicationUser } from '../types.ts';

/**
 * Examination domain service (spec v1.4 §51).
 * The lifecycle DRAFT → REVIEW → APPROVED → PUBLISHED is enforced here; routes only parse,
 * authorize and delegate. Eligible students come from ACTIVE enrollments and teacher write
 * scope comes from teaching_assignments — never from client input.
 */

export type ExamStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED';

const MUTABLE_STATUSES: ExamStatus[] = ['DRAFT'];
export const isExamMutable = (status: ExamStatus) => MUTABLE_STATUSES.includes(status);

type HttpStatus = 400 | 401 | 403 | 404 | 409;

const fail = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>) =>
  new HTTPException(status, { message, cause: { code, details: details ?? null } });

export async function loadExam(db: Db, examId: string) {
  const [row] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!row) throw fail(404, 'EXAM_NOT_FOUND', 'Peperiksaan tidak dijumpai.');
  return row;
}

/** Closed academic years are read-only for exam data (§59). */
export async function assertExamYearOpen(db: Db, academicYearId: string) {
  const [year] = await db.select({ status: academicYears.status }).from(academicYears).where(eq(academicYears.id, academicYearId)).limit(1);
  if (!year) throw fail(404, 'EXAM_YEAR_CLOSED', 'Tahun akademik tidak dijumpai.');
  if (year.status === 'CLOSED') throw fail(409, 'EXAM_YEAR_CLOSED', 'Tahun akademik telah ditutup.');
}

/** Exam configuration is only editable in DRAFT (§8, §30). */
export async function assertExamMutable(db: Db, examId: string) {
  const exam = await loadExam(db, examId);
  await assertExamYearOpen(db, exam.academicYearId);
  if (exam.status === 'PUBLISHED') {
    throw fail(409, 'EXAM_PUBLISHED_IMMUTABLE', 'Peperiksaan telah diterbitkan dan tidak boleh diubah.');
  }
  if (!isExamMutable(exam.status)) {
    throw fail(409, 'EXAM_NOT_MUTABLE', 'Peperiksaan hanya boleh diubah dalam status Draf.');
  }
  return exam;
}

/**
 * Teacher write scope: an assignment must exist for this exam's year, class and subject (§11).
 * ADMIN bypasses the assignment check but still needs the exam to exist.
 */
export async function assertMarkWriteScope(
  db: Db,
  user: ApplicationUser,
  ctx: { academicYearId: string; classId: string; subjectId: string },
) {
  if (user.roles.includes('ADMIN')) return;
  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.profileId, user.profileId)).limit(1);
  if (!staffRow) throw fail(403, 'EXAM_ASSIGNMENT_MISSING', 'Anda tidak mempunyai agihan untuk subjek ini.');
  const [assignment] = await db
    .select({ id: teachingAssignments.id })
    .from(teachingAssignments)
    .where(
      and(
        eq(teachingAssignments.academicYearId, ctx.academicYearId),
        eq(teachingAssignments.teacherId, staffRow.id),
        eq(teachingAssignments.classId, ctx.classId),
        eq(teachingAssignments.subjectId, ctx.subjectId),
      ),
    )
    .limit(1);
  if (!assignment) throw fail(403, 'EXAM_ASSIGNMENT_MISSING', 'Anda tidak mempunyai agihan untuk subjek ini.');
}

/** Exams a user may see: ADMIN all, TEACHER those matching their assignments (§33). */
export async function visibleExamIds(db: Db, user: ApplicationUser): Promise<string[] | null> {
  if (user.roles.includes('ADMIN')) return null;
  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.profileId, user.profileId)).limit(1);
  if (!staffRow) return [];
  const rows = await db
    .select({ examId: examSubjects.examId })
    .from(examSubjects)
    .innerJoin(
      teachingAssignments,
      and(
        eq(teachingAssignments.classId, examSubjects.classId),
        eq(teachingAssignments.subjectId, examSubjects.subjectId),
      ),
    )
    .where(eq(teachingAssignments.teacherId, staffRow.id));
  return [...new Set(rows.map((r) => r.examId))];
}

export async function assertExamVisible(db: Db, user: ApplicationUser, examId: string) {
  const ids = await visibleExamIds(db, user);
  if (ids !== null && !ids.includes(examId)) throw fail(403, 'EXAM_ASSIGNMENT_MISSING', 'Anda tidak mempunyai akses kepada peperiksaan ini.');
}

/** Eligible roster = ACTIVE enrollments in the exam subject's class for the exam year (§12). */
export async function getEligibleStudents(db: Db, examSubjectId: string) {
  const [row] = await db
    .select({
      examId: examSubjects.examId,
      classId: examSubjects.classId,
      subjectId: examSubjects.subjectId,
      maxScore: examSubjects.maxScore,
      passScore: examSubjects.passScore,
      academicYearId: exams.academicYearId,
      status: exams.status,
    })
    .from(examSubjects)
    .innerJoin(exams, eq(exams.id, examSubjects.examId))
    .where(eq(examSubjects.id, examSubjectId))
    .limit(1);
  if (!row) throw fail(404, 'EXAM_SUBJECT_NOT_FOUND', 'Subjek peperiksaan tidak dijumpai.');

  const roster = await db
    .select({
      studentId: students.id,
      studentNo: students.studentNo,
      fullName: students.fullName,
      enrollmentId: enrollments.id,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.classId, row.classId),
        eq(enrollments.academicYearId, row.academicYearId),
        eq(enrollments.status, 'ACTIVE'),
      ),
    )
    .orderBy(asc(students.fullName));

  return { examSubject: row, roster };
}

export type MarkRow = { studentId: string; score: number | null; remarks?: string | null };

/** Validates mark rows against the roster and max score; returns nothing, throws on failure (§14, §21). */
export function validateMarkRows(rows: MarkRow[], rosterIds: Set<string>, maxScore: number) {
  const errors: { studentId: string; code: string; message: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!rosterIds.has(row.studentId)) {
      errors.push({ studentId: row.studentId, code: 'EXAM_STUDENT_NOT_ELIGIBLE', message: 'Murid tidak dalam senarai layak.' });
      continue;
    }
    if (seen.has(row.studentId)) {
      errors.push({ studentId: row.studentId, code: 'EXAM_MARK_DUPLICATE', message: 'Murid berulang dalam senarai.' });
      continue;
    }
    seen.add(row.studentId);
    if (row.score === null || row.score === undefined) continue;
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > maxScore) {
      errors.push({
        studentId: row.studentId,
        code: 'EXAM_MARK_OUT_OF_RANGE',
        message: `Markah mesti antara 0 dan ${maxScore}.`,
      });
    }
  }

  // Surface the first row-level code so callers/tests see the specific reason; keep all rows in details.
  if (errors.length) throw fail(400, errors[0]!.code, 'Terdapat markah tidak sah.', { rows: errors });
}

/**
 * Bulk upsert in one transaction (§53). Blank marks are stored as NULL, never as zero.
 * Returns the number of changed rows for the audit event.
 */
export async function saveMarks(
  db: Db,
  ctx: { examSubjectId: string; rows: MarkRow[]; actorId: string },
): Promise<{ saved: number; changed: number }> {
  const { examSubject, roster } = await getEligibleStudents(db, ctx.examSubjectId);
  await assertExamYearOpen(db, examSubject.academicYearId);
  if (examSubject.status !== 'DRAFT') {
    throw fail(409, examSubject.status === 'PUBLISHED' ? 'EXAM_PUBLISHED_IMMUTABLE' : 'EXAM_NOT_MUTABLE', 'Markah hanya boleh diisi dalam status Draf.');
  }

  const maxScore = Number(examSubject.maxScore);
  validateMarkRows(ctx.rows, new Set(roster.map((r) => r.studentId)), maxScore);

  const existing = await db
    .select({ studentId: examMarks.studentId, score: examMarks.score, remarks: examMarks.remarks })
    .from(examMarks)
    .where(eq(examMarks.examSubjectId, ctx.examSubjectId));
  const before = new Map(existing.map((e) => [e.studentId, e]));

  const changed = ctx.rows.filter((row) => {
    const prev = before.get(row.studentId);
    const nextScore = row.score === null || row.score === undefined ? null : String(row.score);
    return !prev || prev.score !== nextScore;
  }).length;

  await db.transaction(async (tx) => {
    for (const row of ctx.rows) {
      const score = row.score === null || row.score === undefined ? null : String(row.score);
      await tx
        .insert(examMarks)
        .values({
          examSubjectId: ctx.examSubjectId,
          studentId: row.studentId,
          score,
          remarks: row.remarks ?? null,
          enteredBy: ctx.actorId,
          enteredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [examMarks.examSubjectId, examMarks.studentId],
          set: {
            score: sql.raw('excluded."score"'),
            remarks: sql.raw('excluded."remarks"'),
            enteredBy: ctx.actorId,
            enteredAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
  });

  return { saved: ctx.rows.length, changed };
}

/** Completeness across the whole exam (§24, §25). */
export async function getCompleteness(db: Db, examId: string) {
  const examSubjectRows = await db
    .select({
      examSubjectId: examSubjects.id,
      classId: examSubjects.classId,
      className: classes.name,
      subjectId: examSubjects.subjectId,
      subjectName: subjects.nameMs,
      subjectCode: subjects.code,
      maxScore: examSubjects.maxScore,
    })
    .from(examSubjects)
    .innerJoin(classes, eq(classes.id, examSubjects.classId))
    .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
    .where(eq(examSubjects.examId, examId))
    .orderBy(asc(classes.name), asc(subjects.code));

  const [exam] = await db.select({ academicYearId: exams.academicYearId }).from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw fail(404, 'EXAM_NOT_FOUND', 'Peperiksaan tidak dijumpai.');

  const perSubject = [];
  let totalEligible = 0;
  let totalEntered = 0;

  for (const s of examSubjectRows) {
    const roster = await db
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.classId, s.classId),
          eq(enrollments.academicYearId, exam.academicYearId),
          eq(enrollments.status, 'ACTIVE'),
        ),
      );
    const entered = await db
      .select({ total: sql<number>`count(${examMarks.score})::int` })
      .from(examMarks)
      .where(eq(examMarks.examSubjectId, s.examSubjectId));
    const eligible = roster.length;
    const enteredCount = Number(entered[0]?.total ?? 0);
    totalEligible += eligible;
    totalEntered += enteredCount;
    perSubject.push({
      ...s,
      eligible,
      entered: enteredCount,
      missing: Math.max(eligible - enteredCount, 0),
      complete: eligible > 0 && enteredCount >= eligible,
    });
  }

  const missing = Math.max(totalEligible - totalEntered, 0);
  return {
    subjects: perSubject.length,
    eligibleStudents: totalEligible,
    enteredMarks: totalEntered,
    missingMarks: missing,
    completionPercentage: totalEligible === 0 ? 0 : Math.round((totalEntered / totalEligible) * 100),
    ready: perSubject.length > 0 && missing === 0,
    perSubject,
  };
}

/* --------------------------- workflow transitions --------------------------- */

const ALLOWED: Record<ExamStatus, ExamStatus[]> = {
  DRAFT: ['REVIEW'],
  REVIEW: ['DRAFT', 'APPROVED'],
  APPROVED: ['REVIEW', 'PUBLISHED'],
  PUBLISHED: [],
};

export type TransitionTarget = 'REVIEW' | 'DRAFT' | 'APPROVED' | 'PUBLISHED';

export async function transitionExamStatus(
  db: Db,
  ctx: { examId: string; target: TransitionTarget; actorId: string },
): Promise<{ from: ExamStatus; to: ExamStatus }> {
  const exam = await loadExam(db, ctx.examId);
  await assertExamYearOpen(db, exam.academicYearId);
  const from = exam.status as ExamStatus;

  if (!ALLOWED[from].includes(ctx.target)) {
    throw fail(
      409,
      from === 'PUBLISHED' ? 'EXAM_PUBLISHED_IMMUTABLE' : 'EXAM_TRANSITION_INVALID',
      `Peralihan ${from} → ${ctx.target} tidak dibenarkan.`,
    );
  }

  // Entering REVIEW (or approving from REVIEW) requires a complete result set (§23, §27).
  if (ctx.target === 'REVIEW' || ctx.target === 'APPROVED') {
    const completeness = await getCompleteness(db, ctx.examId);
    if (completeness.subjects === 0) {
      throw fail(409, 'EXAM_MARKS_INCOMPLETE', 'Tiada subjek peperiksaan dikonfigurasikan.');
    }
    if (!completeness.ready) {
      throw fail(409, 'EXAM_MARKS_INCOMPLETE', 'Masih ada markah yang belum diisi.', {
        missingMarks: completeness.missingMarks,
        completionPercentage: completeness.completionPercentage,
      });
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(exams)
      .set({ status: ctx.target, updatedAt: new Date() })
      .where(and(eq(exams.id, ctx.examId), eq(exams.status, from)))
      .returning();
    if (!row) throw fail(409, 'EXAM_TRANSITION_INVALID', 'Status peperiksaan telah berubah. Muat semula.');
    return row;
  });

  return { from, to: updated.status as ExamStatus };
}

/* ------------------------------ read helpers ------------------------------ */

export async function listExams(db: Db, filters: { academicYearId?: string; status?: ExamStatus; ids?: string[] | null }) {
  const parts: SQL[] = [];
  if (filters.academicYearId) parts.push(eq(exams.academicYearId, filters.academicYearId));
  if (filters.status) parts.push(eq(exams.status, filters.status));
  if (filters.ids) {
    if (filters.ids.length === 0) return [];
    parts.push(inArray(exams.id, filters.ids));
  }
  return db
    .select({
      id: exams.id,
      academicYearId: exams.academicYearId,
      yearName: academicYears.name,
      name: exams.name,
      term: exams.term,
      examType: exams.examType,
      status: exams.status,
      isActive: exams.isActive,
      startDate: exams.startDate,
      endDate: exams.endDate,
      updatedAt: exams.updatedAt,
    })
    .from(exams)
    .innerJoin(academicYears, eq(academicYears.id, exams.academicYearId))
    .where(parts.length ? and(...parts) : undefined)
    .orderBy(asc(exams.name));
}

export async function listExamSubjects(db: Db, examId: string) {
  return db
    .select({
      id: examSubjects.id,
      examId: examSubjects.examId,
      classId: examSubjects.classId,
      className: classes.name,
      subjectId: examSubjects.subjectId,
      subjectCode: subjects.code,
      subjectName: subjects.nameMs,
      maxScore: examSubjects.maxScore,
      passScore: examSubjects.passScore,
      teacherNames: sql<string | null>`(
        select string_agg(s.full_name, ', ')
        from teaching_assignments ta
        join staff s on s.id = ta.teacher_id
        where ta.class_id = ${examSubjects.classId}
          and ta.subject_id = ${examSubjects.subjectId}
          and ta.academic_year_id = (select academic_year_id from exams where id = ${examId})
      )`,
    })
    .from(examSubjects)
    .innerJoin(classes, eq(classes.id, examSubjects.classId))
    .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
    .where(eq(examSubjects.examId, examId))
    .orderBy(asc(classes.name), asc(subjects.code));
}

/** Per-subject statistics for review/approval screens (§42, §46). No ranking. */
export async function examSummary(db: Db, examId: string) {
  const subjects = await listExamSubjects(db, examId);
  const rows = [];
  for (const s of subjects) {
    const [stats] = await db
      .select({
        entered: sql<number>`count(${examMarks.score})::int`,
        avg: sql<string | null>`round(avg(${examMarks.score})::numeric, 2)::text`,
        highest: sql<string | null>`max(${examMarks.score})::text`,
        lowest: sql<string | null>`min(${examMarks.score})::text`,
      })
      .from(examMarks)
      .where(eq(examMarks.examSubjectId, s.id));
    const [roster] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(enrollments)
      .innerJoin(exams, eq(exams.id, examId))
      .where(and(eq(enrollments.classId, s.classId), eq(enrollments.academicYearId, exams.academicYearId), eq(enrollments.status, 'ACTIVE')));
    rows.push({
      examSubjectId: s.id,
      className: s.className,
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      eligible: Number(roster?.total ?? 0),
      entered: Number(stats?.entered ?? 0),
      average: stats?.avg ?? null,
      highest: stats?.highest ?? null,
      lowest: stats?.lowest ?? null,
    });
  }
  return rows;
}

/** Student result rows for one exam (v1.5 report-card source) — published or internal use (§47). */
export async function studentResults(db: Db, examId: string, studentId: string) {
  const rows = await db
    .select({
      examSubjectId: examSubjects.id,
      subjectCode: subjects.code,
      subjectName: subjects.nameMs,
      className: classes.name,
      maxScore: examSubjects.maxScore,
      score: examMarks.score,
      grade: examMarks.grade,
      remarks: examMarks.remarks,
    })
    .from(examSubjects)
    .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
    .innerJoin(classes, eq(classes.id, examSubjects.classId))
    .leftJoin(examMarks, and(eq(examMarks.examSubjectId, examSubjects.id), eq(examMarks.studentId, studentId)))
    .where(eq(examSubjects.examId, examId))
    .orderBy(asc(subjects.code));
  const [student] = await db.select({ id: students.id, studentNo: students.studentNo, fullName: students.fullName }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!student) throw fail(404, 'EXAM_STUDENT_NOT_ELIGIBLE', 'Murid tidak dijumpai.');
  return { student, results: rows };
}
