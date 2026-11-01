import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { examMarks, examSubjects, exams, teachingAssignments } from '@srik/db';
import { requirePermission, requireUser } from '../auth/session.ts';
import { idParam, parse } from '../app.ts';
import { writeAudit } from './audit.ts';
import {
  assertExamMutable,
  assertExamVisible,
  assertExamYearOpen,
  assertMarkWriteScope,
  examSummary,
  getCompleteness,
  getEligibleStudents,
  listExamSubjects,
  listExams,
  loadExam,
  saveMarks,
  studentResults,
  transitionExamStatus,
  validateMarkRows,
  visibleExamIds,
  type ExamStatus,
} from '../services/exams.ts';
import type { AppEnv } from '../types.ts';

const examInput = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  term: z.string().trim().max(30).nullish(),
  examType: z.string().trim().min(1).max(40).default('SUMBER'),
  startDate: z.string().date().nullish(),
  endDate: z.string().date().nullish(),
  isActive: z.boolean().default(true),
});

const examSubjectInput = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  maxScore: z.coerce.number().positive().max(1000).default(100),
  passScore: z.coerce.number().min(0).max(1000).nullish(),
});

const markRow = z.object({
  studentId: z.string().uuid(),
  score: z.coerce.number().min(0).max(1000).nullish(),
  remarks: z.string().trim().max(200).nullish(),
});

const marksInput = z.object({ rows: z.array(markRow).min(1).max(200) });

const listQuery = z.object({
  academicYearId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']).optional(),
});

export const examRoutes = new Hono<AppEnv>();

/* --------------------------------- exams --------------------------------- */

examRoutes.get('/exams', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const query = parse(listQuery, c.req.query());
  const ids = await visibleExamIds(c.var.db, user);
  if (ids && ids.length === 0) return c.json({ data: [], meta: { total: 0 }, requestId: c.var.requestId });
  const rows = await listExams(c.var.db, { ...query, ids });
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

examRoutes.get('/exams/:id', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  await assertExamVisible(c.var.db, user, id);
  const exam = await loadExam(c.var.db, id);
  const subjects = await listExamSubjects(c.var.db, id);
  return c.json({ data: { ...exam, subjects }, requestId: c.var.requestId });
});

examRoutes.post('/exams', requirePermission('exam.manage'), async (c) => {
  const actor = requireUser(c);
  const input = parse(examInput, await c.req.json().catch(() => ({})));
  await assertExamYearOpen(c.var.db, input.academicYearId);
  const [row] = await c.var.db.insert(exams).values({ ...input, createdBy: actor.profileId }).returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'exam.create',
    resourceType: 'exam',
    resourceId: row!.id,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

examRoutes.patch('/exams/:id', requirePermission('exam.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(examInput.partial(), await c.req.json().catch(() => ({})));
  const before = await assertExamMutable(c.var.db, id);
  if (input.academicYearId) await assertExamYearOpen(c.var.db, input.academicYearId);
  const [row] = await c.var.db
    .update(exams)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(exams.id, id))
    .returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'exam.update',
    resourceType: 'exam',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/* ------------------------------ exam subjects ----------------------------- */

examRoutes.get('/exams/:id/subjects', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  await assertExamVisible(c.var.db, user, id);
  const rows = await listExamSubjects(c.var.db, id);
  return c.json({ data: rows, meta: { total: rows.length }, requestId: c.var.requestId });
});

examRoutes.post('/exams/:id/subjects', requirePermission('exam.manage'), async (c) => {
  const actor = requireUser(c);
  const examId = idParam(c);
  const input = parse(examSubjectInput, await c.req.json().catch(() => ({})));
  const exam = await assertExamMutable(c.var.db, examId);

  // Every exam subject must map to a real teaching assignment (§39).
  const [assignment] = await c.var.db
    .select({ id: teachingAssignments.id })
    .from(teachingAssignments)
    .where(
      and(
        eq(teachingAssignments.academicYearId, exam.academicYearId),
        eq(teachingAssignments.classId, input.classId),
        eq(teachingAssignments.subjectId, input.subjectId),
      ),
    )
    .limit(1);
  if (!assignment) {
    throw new HTTPException(409, { message: 'Tiada agihan pengajaran untuk kelas dan subjek ini.', cause: { code: 'EXAM_ASSIGNMENT_MISSING' } });
  }
  if (input.passScore != null && input.passScore > input.maxScore) {
    throw new HTTPException(400, { message: 'Markah lulus tidak boleh melebihi markah penuh.', cause: { code: 'EXAM_MARK_OUT_OF_RANGE' } });
  }

  try {
    const [row] = await c.var.db
      .insert(examSubjects)
      .values({
        examId,
        classId: input.classId,
        subjectId: input.subjectId,
        maxScore: String(input.maxScore),
        passScore: input.passScore == null ? null : String(input.passScore),
      })
      .returning();
    await writeAudit(c.var.db, {
      actorId: actor.profileId,
      action: 'exam.subject.create',
      resourceType: 'exam_subject',
      resourceId: row!.id,
      after: row,
      requestId: c.var.requestId,
    });
    return c.json({ data: row, requestId: c.var.requestId }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new HTTPException(409, {
        message: 'Subjek ini sudah dikonfigurasikan untuk kelas tersebut.',
        cause: { code: 'EXAM_SUBJECT_EXISTS' },
      });
    }
    throw err;
  }
});

examRoutes.patch('/exam-subjects/:id', requirePermission('exam.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = parse(examSubjectInput.partial(), await c.req.json().catch(() => ({})));
  const [before] = await c.var.db.select().from(examSubjects).where(eq(examSubjects.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Subjek peperiksaan tidak dijumpai.', cause: { code: 'EXAM_SUBJECT_NOT_FOUND' } });
  await assertExamMutable(c.var.db, before.examId);

  const maxScore = input.maxScore ?? Number(before.maxScore);
  const passScore = input.passScore === undefined ? (before.passScore == null ? null : Number(before.passScore)) : input.passScore;
  if (passScore != null && passScore > maxScore) {
    throw new HTTPException(400, { message: 'Markah lulus tidak boleh melebihi markah penuh.', cause: { code: 'EXAM_MARK_OUT_OF_RANGE' } });
  }

  const [row] = await c.var.db
    .update(examSubjects)
    .set({
      maxScore: String(maxScore),
      passScore: passScore == null ? null : String(passScore),
      updatedAt: new Date(),
    })
    .where(eq(examSubjects.id, id))
    .returning();
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'exam.subject.update',
    resourceType: 'exam_subject',
    resourceId: id,
    before,
    after: row,
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId });
});

/** Delete is only allowed while the exam is DRAFT and no marks exist (§19). */
examRoutes.delete('/exam-subjects/:id', requirePermission('exam.manage'), async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [before] = await c.var.db.select().from(examSubjects).where(eq(examSubjects.id, id)).limit(1);
  if (!before) throw new HTTPException(404, { message: 'Subjek peperiksaan tidak dijumpai.', cause: { code: 'EXAM_SUBJECT_NOT_FOUND' } });
  await assertExamMutable(c.var.db, before.examId);
  const [marks] = await c.var.db.select({ total: examMarks.id }).from(examMarks).where(eq(examMarks.examSubjectId, id)).limit(1);
  if (marks) {
    throw new HTTPException(409, { message: 'Subjek ini sudah mempunyai markah.', cause: { code: 'EXAM_NOT_MUTABLE' } });
  }
  await c.var.db.delete(examSubjects).where(eq(examSubjects.id, id));
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'exam.subject.delete',
    resourceType: 'exam_subject',
    resourceId: id,
    before,
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});

/* --------------------------------- marks --------------------------------- */

examRoutes.get('/exam-subjects/:id/marks', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const { examSubject, roster } = await getEligibleStudents(c.var.db, id);
  await assertExamVisible(c.var.db, user, examSubject.examId);

  const rows = await c.var.db
    .select({ studentId: examMarks.studentId, score: examMarks.score, grade: examMarks.grade, remarks: examMarks.remarks })
    .from(examMarks)
    .where(eq(examMarks.examSubjectId, id));
  const byStudent = new Map(rows.map((r) => [r.studentId, r]));

  const data = roster.map((s) => {
    const mark = byStudent.get(s.studentId);
    return {
      studentId: s.studentId,
      studentNo: s.studentNo,
      fullName: s.fullName,
      score: mark?.score ?? null,
      grade: mark?.grade ?? null,
      remarks: mark?.remarks ?? null,
    };
  });

  return c.json({
    data,
    meta: {
      examSubjectId: id,
      examId: examSubject.examId,
      className: null,
      maxScore: examSubject.maxScore,
      passScore: examSubject.passScore,
      status: examSubject.status,
      eligible: roster.length,
      entered: data.filter((d) => d.score !== null).length,
    },
    requestId: c.var.requestId,
  });
});

examRoutes.put('/exam-subjects/:id/marks', requirePermission('exam.marks.write'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  const { rows } = parse(marksInput, await c.req.json().catch(() => ({})));
  const { examSubject } = await getEligibleStudents(c.var.db, id);
  await assertMarkWriteScope(c.var.db, user, {
    academicYearId: examSubject.academicYearId,
    classId: examSubject.classId,
    subjectId: examSubject.subjectId,
  });

  const normalised = rows.map((r) => ({ studentId: r.studentId, score: r.score ?? null, remarks: r.remarks ?? null }));
  const result = await saveMarks(c.var.db, { examSubjectId: id, rows: normalised, actorId: user.profileId });
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'exam.marks.save',
    resourceType: 'exam_subject',
    resourceId: id,
    after: { rowCount: result.saved, changedCount: result.changed },
    requestId: c.var.requestId,
  });
  return c.json({ data: result, requestId: c.var.requestId });
});

/* ------------------------------- workflow -------------------------------- */

const transition = (path: string, target: 'REVIEW' | 'DRAFT' | 'APPROVED' | 'PUBLISHED', permission: 'exam.marks.review' | 'exam.marks.approve' | 'exam.publish', audit: string) => {
  examRoutes.post(path, requirePermission(permission), async (c) => {
    const actor = requireUser(c);
    const id = idParam(c);
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const result = await transitionExamStatus(c.var.db, { examId: id, target, actorId: actor.profileId });
    await writeAudit(c.var.db, {
      actorId: actor.profileId,
      action: audit,
      resourceType: 'exam',
      resourceId: id,
      before: { status: result.from },
      after: { status: result.to, reason: (body as { reason?: string }).reason ?? null },
      requestId: c.var.requestId,
    });
    return c.json({ data: result, requestId: c.var.requestId });
  });
};

transition('/exams/:id/submit-review', 'REVIEW', 'exam.marks.review', 'exam.submit_review');
transition('/exams/:id/return-draft', 'DRAFT', 'exam.marks.review', 'exam.return_draft');
transition('/exams/:id/approve', 'APPROVED', 'exam.marks.approve', 'exam.approve');
transition('/exams/:id/return-review', 'REVIEW', 'exam.marks.approve', 'exam.return_review');
transition('/exams/:id/publish', 'PUBLISHED', 'exam.publish', 'exam.publish');

/* -------------------------------- summary -------------------------------- */

examRoutes.get('/exams/:id/completeness', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  await assertExamVisible(c.var.db, user, id);
  const data = await getCompleteness(c.var.db, id);
  return c.json({ data, requestId: c.var.requestId });
});

examRoutes.get('/exams/:id/summary', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const id = idParam(c);
  await assertExamVisible(c.var.db, user, id);
  const data = await examSummary(c.var.db, id);
  return c.json({ data, meta: { total: data.length }, requestId: c.var.requestId });
});

examRoutes.get('/exams/:examId/students/:studentId/results', requirePermission('exam.read'), async (c) => {
  const user = requireUser(c);
  const examId = idParam(c, 'examId');
  const studentId = idParam(c, 'studentId');
  await assertExamVisible(c.var.db, user, examId);
  const data = await studentResults(c.var.db, examId, studentId);
  return c.json({ data, requestId: c.var.requestId });
});

/** Exposed for tests: pure validation without touching the DB. */
export { validateMarkRows };
export type { ExamStatus };
