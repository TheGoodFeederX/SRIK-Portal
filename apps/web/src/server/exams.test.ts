import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  academicYears,
  classes,
  createDb,
  enrollments,
  examMarks,
  examSubjects,
  exams,
  profiles,
  staff,
  students,
  subjects,
  teachingAssignments,
} from '@srik/db';
import {
  assertMarkWriteScope,
  getCompleteness,
  getEligibleStudents,
  saveMarks,
  transitionExamStatus,
  validateMarkRows,
  visibleExamIds,
} from './services/exams.ts';
import type { ApplicationUser } from './types.ts';

/**
 * v1.4 examination workflow, scope and immutability (spec §65–§69).
 *   SRIK_INTEGRATION=1 DATABASE_URL=<dev branch> node --test src/server/exams.test.ts
 */
const url = process.env.DATABASE_URL;
const enabled = Boolean(url) && process.env.SRIK_INTEGRATION === '1';
const run = enabled ? test : test.skip;
const db = url ? createDb(url) : (null as never);

const tag = randomUUID().slice(0, 8);
const fx = {
  year: '',
  closedYear: '',
  classA: '',
  classB: '',
  subject: '',
  studentA: '',
  studentB: '',
  teacherAStaff: '',
  teacherBStaff: '',
  teacherA: null as unknown as ApplicationUser,
  teacherB: null as unknown as ApplicationUser,
  exam: '',
  examSubject: '',
  examSubjectB: '',
};

const makeTeacher = async (label: string) => {
  const [profile] = await db
    .insert(profiles)
    .values({ email: `${label}-${tag}@srik.test`, displayName: label, status: 'ACTIVE', authUserId: randomUUID() })
    .returning({ id: profiles.id });
  const [row] = await db
    .insert(staff)
    .values({ staffNo: `${label}-${tag}`, fullName: `Guru ${label}`, joinDate: '2026-01-05', profileId: profile!.id })
    .returning({ id: staff.id });
  const user: ApplicationUser = {
    profileId: profile!.id,
    authUserId: 'test',
    email: `${label}-${tag}@srik.test`,
    displayName: label,
    roles: ['TEACHER'],
    permissions: ['exam.read', 'exam.marks.write'],
    mustChangePassword: false,
  };
  return { staffId: row!.id, user };
};

run('setup exam fixtures', async () => {
  const [year] = await db
    .insert(academicYears)
    .values({ name: `EX-${tag}`, startDate: '2026-01-04', endDate: '2026-11-19', isCurrent: false, status: 'ACTIVE' })
    .returning({ id: academicYears.id });
  const [closed] = await db
    .insert(academicYears)
    .values({ name: `EXC-${tag}`, startDate: '2025-01-05', endDate: '2025-11-20', isCurrent: false, status: 'CLOSED' })
    .returning({ id: academicYears.id });
  fx.year = year!.id;
  fx.closedYear = closed!.id;

  const [classA] = await db.insert(classes).values({ academicYearId: fx.year, yearLevel: 4, name: `4A-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  const [classB] = await db.insert(classes).values({ academicYearId: fx.year, yearLevel: 4, name: `4B-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  fx.classA = classA!.id;
  fx.classB = classB!.id;

  const [subject] = await db.insert(subjects).values({ code: `EXBM-${tag}`, nameMs: 'Bahasa Melayu' }).returning({ id: subjects.id });
  fx.subject = subject!.id;

  const mk = async (no: string, name: string) => {
    const [row] = await db
      .insert(students)
      .values({ studentNo: no, fullName: name, gender: 'MALE', dateOfBirth: '2016-01-01', enrollmentDate: '2026-01-05', status: 'ACTIVE' })
      .returning({ id: students.id });
    return row!.id;
  };
  fx.studentA = await mk(`EXA-${tag}`, 'Murid A');
  fx.studentB = await mk(`EXB-${tag}`, 'Murid B');

  await db.insert(enrollments).values([
    { studentId: fx.studentA, classId: fx.classA, academicYearId: fx.year, enrolledAt: '2026-01-05', status: 'ACTIVE' },
    { studentId: fx.studentB, classId: fx.classB, academicYearId: fx.year, enrolledAt: '2026-01-05', status: 'ACTIVE' },
  ]);

  const a = await makeTeacher('ExA');
  const b = await makeTeacher('ExB');
  fx.teacherAStaff = a.staffId;
  fx.teacherBStaff = b.staffId;
  fx.teacherA = a.user;
  fx.teacherB = b.user;

  await db.insert(teachingAssignments).values([
    { academicYearId: fx.year, teacherId: fx.teacherAStaff, classId: fx.classA, subjectId: fx.subject },
    { academicYearId: fx.year, teacherId: fx.teacherBStaff, classId: fx.classB, subjectId: fx.subject },
  ]);

  const [exam] = await db
    .insert(exams)
    .values({ academicYearId: fx.year, name: `Peperiksaan ${tag}`, examType: 'SUMBER', status: 'DRAFT' })
    .returning({ id: exams.id });
  fx.exam = exam!.id;

  const [es] = await db
    .insert(examSubjects)
    .values({ examId: fx.exam, classId: fx.classA, subjectId: fx.subject, maxScore: '100' })
    .returning({ id: examSubjects.id });
  fx.examSubject = es!.id;

  const [esB] = await db
    .insert(examSubjects)
    .values({ examId: fx.exam, classId: fx.classB, subjectId: fx.subject, maxScore: '50' })
    .returning({ id: examSubjects.id });
  fx.examSubjectB = esB!.id;
});

run('duplicate exam subject is rejected', async () => {
  await assert.rejects(
    db.insert(examSubjects).values({ examId: fx.exam, classId: fx.classA, subjectId: fx.subject, maxScore: '100' }),
    (err: Error & { cause?: { code?: string } }) => /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('eligible roster comes from active enrollment', async () => {
  const { roster } = await getEligibleStudents(db, fx.examSubject);
  assert.deepEqual(roster.map((r) => r.studentId), [fx.studentA]);
});

run('mark validation rejects out-of-range values', () => {
  assert.throws(
    () => validateMarkRows([{ studentId: fx.studentA, score: 120 }], new Set([fx.studentA]), 100),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_MARK_OUT_OF_RANGE',
  );
  assert.throws(
    () => validateMarkRows([{ studentId: fx.studentA, score: -1 }], new Set([fx.studentA]), 100),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_MARK_OUT_OF_RANGE',
  );
  assert.doesNotThrow(() => validateMarkRows([{ studentId: fx.studentA, score: 0 }], new Set([fx.studentA]), 100));
});

run('student outside the class is rejected', () => {
  assert.throws(
    () => validateMarkRows([{ studentId: fx.studentB, score: 10 }], new Set([fx.studentA]), 100),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_STUDENT_NOT_ELIGIBLE',
  );
});

run('teacher scope: own assignment allowed, other teacher denied', async () => {
  const ctx = { academicYearId: fx.year, classId: fx.classA, subjectId: fx.subject };
  await assert.doesNotReject(assertMarkWriteScope(db, fx.teacherA, ctx));
  await assert.rejects(assertMarkWriteScope(db, fx.teacherB, ctx), (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_ASSIGNMENT_MISSING');
});

run('bulk save is transactional and keeps blanks as NULL', async () => {
  const result = await saveMarks(db, { examSubjectId: fx.examSubject, rows: [{ studentId: fx.studentA, score: null }], actorId: fx.teacherA.profileId });
  assert.equal(result.saved, 1);
  const [row] = await db.select({ score: examMarks.score }).from(examMarks).where(eq(examMarks.examSubjectId, fx.examSubject));
  assert.equal(row!.score, null);

  // One invalid row (student B is not in class A) must reject the whole batch.
  await assert.rejects(
    saveMarks(db, {
      examSubjectId: fx.examSubject,
      rows: [
        { studentId: fx.studentA, score: 10 },
        { studentId: fx.studentB, score: 10 },
      ],
      actorId: fx.teacherA.profileId,
    }),
    (err: { cause?: { code?: string } }) => ['EXAM_STUDENT_NOT_ELIGIBLE', 'EXAM_MARK_OUT_OF_RANGE'].includes(err.cause?.code ?? ''),
  );
  const [after] = await db.select({ score: examMarks.score }).from(examMarks).where(eq(examMarks.examSubjectId, fx.examSubject));
  assert.equal(after!.score, null, 'failed batch must not partially save');
});

run('incomplete marks block DRAFT → REVIEW', async () => {
  await assert.rejects(
    transitionExamStatus(db, { examId: fx.exam, target: 'REVIEW', actorId: fx.teacherA.profileId }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_MARKS_INCOMPLETE',
  );
});

run('complete marks allow the full workflow', async () => {
  await saveMarks(db, { examSubjectId: fx.examSubject, rows: [{ studentId: fx.studentA, score: 80 }], actorId: fx.teacherA.profileId });
  await saveMarks(db, { examSubjectId: fx.examSubjectB, rows: [{ studentId: fx.studentB, score: 40 }], actorId: fx.teacherB.profileId });

  const completeness = await getCompleteness(db, fx.exam);
  assert.equal(completeness.ready, true);
  assert.equal(completeness.missingMarks, 0);

  assert.deepEqual(await transitionExamStatus(db, { examId: fx.exam, target: 'REVIEW', actorId: fx.teacherA.profileId }), { from: 'DRAFT', to: 'REVIEW' });
  assert.deepEqual(await transitionExamStatus(db, { examId: fx.exam, target: 'APPROVED', actorId: fx.teacherA.profileId }), { from: 'REVIEW', to: 'APPROVED' });
  assert.deepEqual(await transitionExamStatus(db, { examId: fx.exam, target: 'PUBLISHED', actorId: fx.teacherA.profileId }), { from: 'APPROVED', to: 'PUBLISHED' });
});

run('published exam rejects further transitions and mark edits', async () => {
  await assert.rejects(
    transitionExamStatus(db, { examId: fx.exam, target: 'REVIEW', actorId: fx.teacherA.profileId }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_PUBLISHED_IMMUTABLE',
  );
  await assert.rejects(
    saveMarks(db, { examSubjectId: fx.examSubject, rows: [{ studentId: fx.studentA, score: 90 }], actorId: fx.teacherA.profileId }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_PUBLISHED_IMMUTABLE',
  );
});

run('invalid transition DRAFT → APPROVED is rejected', async () => {
  const [draft] = await db
    .insert(exams)
    .values({ academicYearId: fx.year, name: `Draf ${tag}`, examType: 'SUMBER', status: 'DRAFT' })
    .returning({ id: exams.id });
  await assert.rejects(
    transitionExamStatus(db, { examId: draft!.id, target: 'APPROVED', actorId: fx.teacherA.profileId }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_TRANSITION_INVALID',
  );
});

run('closed academic year blocks exam creation guard', async () => {
  const [closedExam] = await db
    .insert(exams)
    .values({ academicYearId: fx.closedYear, name: `Tutup ${tag}`, examType: 'SUMBER', status: 'DRAFT' })
    .returning({ id: exams.id });
  await assert.rejects(
    transitionExamStatus(db, { examId: closedExam!.id, target: 'REVIEW', actorId: fx.teacherA.profileId }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'EXAM_YEAR_CLOSED',
  );
});

run('teacher only sees exams within their assignments', async () => {
  const idsA = await visibleExamIds(db, fx.teacherA);
  assert.ok(idsA?.includes(fx.exam));
  const orphan = await visibleExamIds(db, {
    profileId: randomUUID(),
    authUserId: 'x',
    email: 'x@y.z',
    displayName: 'x',
    roles: ['TEACHER'],
    permissions: [],
    mustChangePassword: false,
  });
  assert.deepEqual(orphan, []);
});

after(async () => {
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
