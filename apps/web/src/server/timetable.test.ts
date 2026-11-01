import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  academicYears,
  classes,
  createDb,
  profiles,
  staff,
  subjects,
  teachingAssignments,
  timetableEntries,
  timetablePeriods,
} from '@srik/db';
import { validateTimetableEntry, countTimetableReferences, mapUniqueViolationToConflict } from './services/timetable.ts';
import { canAccessClass } from './auth/scope.ts';
import type { ApplicationUser } from './types.ts';

/**
 * v1.3 timetable conflict engine + scope regression (spec §53–§59).
 *   SRIK_INTEGRATION=1 DATABASE_URL=<dev branch> node --test src/server/timetable.test.ts
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
  subjectBM: '',
  subjectEN: '',
  teacherA: '',
  teacherB: '',
  assignA: '',
  assignB: '',
  assignB2: '',
  period2: '',
  period3: '',
  breakPeriod: '',
  teacherAUser: null as unknown as ApplicationUser,
};

const createTeacher = async (label: string) => {
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
    permissions: ['timetable.read'],
    mustChangePassword: false,
  };
  return { staffId: row!.id, user };
};

run('setup timetable fixtures', async () => {
  const [year] = await db
    .insert(academicYears)
    .values({ name: `TT-${tag}`, startDate: '2026-01-04', endDate: '2026-11-19', isCurrent: false, status: 'ACTIVE' })
    .returning({ id: academicYears.id });
  const [closed] = await db
    .insert(academicYears)
    .values({ name: `TTC-${tag}`, startDate: '2025-01-05', endDate: '2025-11-20', isCurrent: false, status: 'CLOSED' })
    .returning({ id: academicYears.id });
  fx.year = year!.id;
  fx.closedYear = closed!.id;

  const [classA] = await db.insert(classes).values({ academicYearId: fx.year, yearLevel: 2, name: `2A-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  const [classB] = await db.insert(classes).values({ academicYearId: fx.year, yearLevel: 2, name: `2B-${tag}`, status: 'ACTIVE' }).returning({ id: classes.id });
  fx.classA = classA!.id;
  fx.classB = classB!.id;

  const [bm] = await db.insert(subjects).values({ code: `TTBM-${tag}`, nameMs: 'Bahasa Melayu' }).returning({ id: subjects.id });
  const [en] = await db.insert(subjects).values({ code: `TTEN-${tag}`, nameMs: 'English' }).returning({ id: subjects.id });
  fx.subjectBM = bm!.id;
  fx.subjectEN = en!.id;

  const a = await createTeacher('A');
  const b = await createTeacher('B');
  fx.teacherA = a.staffId;
  fx.teacherB = b.staffId;
  fx.teacherAUser = a.user;

  const [assignA] = await db
    .insert(teachingAssignments)
    .values({ academicYearId: fx.year, teacherId: fx.teacherA, classId: fx.classA, subjectId: fx.subjectBM })
    .returning({ id: teachingAssignments.id });
  const [assignB] = await db
    .insert(teachingAssignments)
    .values({ academicYearId: fx.year, teacherId: fx.teacherB, classId: fx.classB, subjectId: fx.subjectBM })
    .returning({ id: teachingAssignments.id });
  const [assignB2] = await db
    .insert(teachingAssignments)
    .values({ academicYearId: fx.year, teacherId: fx.teacherA, classId: fx.classB, subjectId: fx.subjectEN })
    .returning({ id: teachingAssignments.id });
  fx.assignA = assignA!.id;
  fx.assignB = assignB!.id;
  fx.assignB2 = assignB2!.id;

  const [p2] = await db
    .insert(timetablePeriods)
    .values({ academicYearId: fx.year, periodNo: 1, label: 'Waktu 1', startTime: '07:30', endTime: '08:00', type: 'ASSEMBLY', sortOrder: 1 })
    .returning({ id: timetablePeriods.id });
  const [p3] = await db
    .insert(timetablePeriods)
    .values({ academicYearId: fx.year, periodNo: 2, label: 'Waktu 2', startTime: '08:00', endTime: '08:30', type: 'LESSON', sortOrder: 2 })
    .returning({ id: timetablePeriods.id });
  const [p4] = await db
    .insert(timetablePeriods)
    .values({ academicYearId: fx.year, periodNo: 3, label: 'Waktu 3', startTime: '08:30', endTime: '09:00', type: 'LESSON', sortOrder: 3 })
    .returning({ id: timetablePeriods.id });
  fx.breakPeriod = p2!.id;
  fx.period2 = p3!.id;
  fx.period3 = p4!.id;
});

const base = () => ({
  academicYearId: fx.year,
  classId: fx.classA,
  periodId: fx.period3,
  dayOfWeek: 'MONDAY' as const,
  entryType: 'LESSON' as const,
});

run('duplicate period_no is rejected', async () => {
  await assert.rejects(
    db.insert(timetablePeriods).values({ academicYearId: fx.year, periodNo: 2, label: 'Duplikat', startTime: '09:00', endTime: '09:30', sortOrder: 9 }),
    (err: Error & { cause?: { code?: string } }) => /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('valid assignment is accepted and derives teacher/subject', async () => {
  const resolved = await validateTimetableEntry(db, { ...base(), teachingAssignmentId: fx.assignA });
  assert.equal(resolved.teacherId, fx.teacherA);
  assert.equal(resolved.subjectId, fx.subjectBM);
  const [row] = await db.insert(timetableEntries).values(resolved).returning();
  assert.equal(row!.teacherId, fx.teacherA);
});

run('assignment from another class is rejected', async () => {
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), classId: fx.classA, teachingAssignmentId: fx.assignB }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_INVALID_ASSIGNMENT',
  );
});

run('assignment from another year is rejected', async () => {
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), academicYearId: fx.closedYear, teachingAssignmentId: fx.assignA }),
    (err: { cause?: { code?: string } }) => ['TIMETABLE_YEAR_CLOSED', 'TIMETABLE_PERIOD_YEAR_MISMATCH', 'TIMETABLE_INVALID_ASSIGNMENT'].includes(err.cause?.code ?? ''),
  );
});

run('lesson without assignment is rejected', async () => {
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), teachingAssignmentId: null }),
    (err: { cause?: { code?: string }; status?: number }) => err.cause?.code === 'TIMETABLE_INVALID_ASSIGNMENT' || err.status === 400,
  );
});

run('lesson in a non-lesson period is rejected', async () => {
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), periodId: fx.breakPeriod, teachingAssignmentId: fx.assignA }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_INVALID_ASSIGNMENT',
  );
});

run('class conflict is blocked', async () => {
  // Same class, same day/period, different assignment that exists for that class would still collide.
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), teachingAssignmentId: fx.assignA }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_CLASS_CONFLICT',
  );
});

run('teacher conflict is blocked across classes', async () => {
  // Teacher A also teaches English in class B -> scheduling it in the same slot must fail.
  await assert.rejects(
    validateTimetableEntry(db, { ...base(), classId: fx.classB, teachingAssignmentId: fx.assignB2 }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_TEACHER_CONFLICT',
  );
});

run('other class, other teacher, same slot is allowed', async () => {
  const resolved = await validateTimetableEntry(db, { ...base(), classId: fx.classB, dayOfWeek: 'TUESDAY', teachingAssignmentId: fx.assignB });
  const [row] = await db.insert(timetableEntries).values(resolved).returning();
  assert.equal(row!.classId, fx.classB);
});

run('room conflict is blocked', async () => {
  const resolved = await validateTimetableEntry(db, {
    ...base(),
    classId: fx.classA,
    dayOfWeek: 'WEDNESDAY',
    teachingAssignmentId: fx.assignA,
    room: 'Makmal',
  });
  await db.insert(timetableEntries).values(resolved);
  await assert.rejects(
    validateTimetableEntry(db, {
      ...base(),
      classId: fx.classB,
      dayOfWeek: 'WEDNESDAY',
      teachingAssignmentId: fx.assignB,
      room: 'Makmal',
    }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_ROOM_CONFLICT',
  );
});

run('db unique index is the final race guard', async () => {
  const resolved = await validateTimetableEntry(db, { ...base(), dayOfWeek: 'THURSDAY', teachingAssignmentId: fx.assignA });
  await db.insert(timetableEntries).values(resolved);
  // Bypass the service and insert the same slot directly.
  await assert.rejects(
    db.insert(timetableEntries).values(resolved),
    (err: Error & { cause?: { code?: string }; code?: string }) => {
      const violation = { code: '23505', constraint_name: 'timetable_class_slot_unique' };
      assert.throws(() => mapUniqueViolationToConflict(violation), (mapped: { cause?: { code?: string } }) => mapped.cause?.code === 'TIMETABLE_CLASS_CONFLICT');
      return /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505' || err.code === '23505';
    },
  );
});

run('assignment referenced by timetable reports references (deletion guard)', async () => {
  const refs = await countTimetableReferences(db, fx.assignA);
  assert.ok(refs > 0, `expected references, got ${refs}`);
  const unused = await countTimetableReferences(db, fx.assignB2);
  assert.equal(unused, 0);
});

run('teacher could not access an unrelated class timetable', async () => {
  // Teacher A has no homeroom and no assignment in class A? It does, so check a class created out of scope.
  const [foreign] = await db
    .insert(classes)
    .values({ academicYearId: fx.year, yearLevel: 3, name: `3C-${tag}`, status: 'ACTIVE' })
    .returning({ id: classes.id });
  assert.equal(await canAccessClass(db, fx.teacherAUser, foreign!.id), false);
  assert.equal(await canAccessClass(db, fx.teacherAUser, fx.classA), true);
});

run('closed year blocks new entries', async () => {
  const [closedPeriod] = await db
    .insert(timetablePeriods)
    .values({ academicYearId: fx.closedYear, periodNo: 1, label: 'W1', startTime: '07:30', endTime: '08:00', type: 'LESSON', sortOrder: 1 })
    .returning({ id: timetablePeriods.id });
  await assert.rejects(
    validateTimetableEntry(db, {
      academicYearId: fx.closedYear,
      classId: fx.classA,
      periodId: closedPeriod!.id,
      dayOfWeek: 'MONDAY',
      entryType: 'LESSON',
      teachingAssignmentId: fx.assignA,
    }),
    (err: { cause?: { code?: string } }) => err.cause?.code === 'TIMETABLE_YEAR_CLOSED',
  );
});

after(async () => {
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
