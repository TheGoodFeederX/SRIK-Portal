import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { academicYears, classes, createDb, enrollments, staff, students, subjects, teachingAssignments } from '@srik/db';
import { getTeacherStudentIds, getTeacherClassIds } from './auth/scope.ts';
import type { ApplicationUser } from './types.ts';

/**
 * v1.2 Academic Foundation fixtures + regression (spec §42–§45).
 * Development branch only:
 *   SRIK_INTEGRATION=1 DATABASE_URL=<dev branch> node --test src/server/academic.test.ts
 */
const url = process.env.DATABASE_URL;
const enabled = Boolean(url) && process.env.SRIK_INTEGRATION === '1';
const run = enabled ? test : test.skip;
const db = url ? createDb(url) : (null as never);

const tag = randomUUID().slice(0, 8);
const fixtures = {
  yearA: '',
  yearClosed: '',
  classA: '',
  classB: '',
  studentA: '',
  studentB: '',
  subjectBM: '',
  subjectEN: '',
  teacherAStaff: '',
  teacherBStaff: '',
  teacherA: null as unknown as ApplicationUser,
  teacherB: null as unknown as ApplicationUser,
};

const makeStaffWithUser = async (name: string, teacherRole = true) => {
  const [profile] = await db
    .insert(profilesTable)
    .values({ email: `${name.toLowerCase()}-${tag}@srik.test`, displayName: name, status: 'ACTIVE', authUserId: randomUUID() })
    .returning({ id: profilesTable.id });
  const [row] = await db
    .insert(staff)
    .values({ staffNo: `${name}-${tag}`, fullName: name, joinDate: '2026-01-05', profileId: profile!.id })
    .returning({ id: staff.id });
  const user: ApplicationUser = {
    profileId: profile!.id,
    authUserId: 'test',
    email: `${name}-${tag}@srik.test`,
    displayName: name,
    roles: teacherRole ? ['TEACHER'] : [],
    permissions: [],
    mustChangePassword: false,
  };
  return { staffId: row!.id, user };
};

// profiles table is imported lazily to keep the import list short.
const { profiles: profilesTable } = await import('@srik/db');

run('setup academic fixtures', async () => {
  const [yearA] = await db
    .insert(academicYears)
    .values({ name: `2026/2027-${tag}`, startDate: '2026-01-05', endDate: '2026-11-20', isCurrent: false, status: 'ACTIVE' })
    .returning({ id: academicYears.id });
  const [yearClosed] = await db
    .insert(academicYears)
    .values({ name: `2025/2026-${tag}`, startDate: '2025-01-06', endDate: '2025-11-21', isCurrent: false, status: 'CLOSED' })
    .returning({ id: academicYears.id });
  fixtures.yearA = yearA!.id;
  fixtures.yearClosed = yearClosed!.id;

  const [classA] = await db
    .insert(classes)
    .values({ academicYearId: fixtures.yearA, yearLevel: 1, name: `1A-${tag}`, status: 'ACTIVE' })
    .returning({ id: classes.id });
  const [classB] = await db
    .insert(classes)
    .values({ academicYearId: fixtures.yearA, yearLevel: 1, name: `1B-${tag}`, status: 'ACTIVE' })
    .returning({ id: classes.id });
  fixtures.classA = classA!.id;
  fixtures.classB = classB!.id;

  const [studentA] = await db
    .insert(students)
    .values({
      studentNo: `SA-${tag}`,
      fullName: 'Student A',
      gender: 'MALE',
      dateOfBirth: '2019-01-01',
      enrollmentDate: '2026-01-05',
      status: 'ACTIVE',
    })
    .returning({ id: students.id });
  const [studentB] = await db
    .insert(students)
    .values({
      studentNo: `SB-${tag}`,
      fullName: 'Student B',
      gender: 'FEMALE',
      dateOfBirth: '2019-02-02',
      enrollmentDate: '2026-01-05',
      status: 'ACTIVE',
    })
    .returning({ id: students.id });
  fixtures.studentA = studentA!.id;
  fixtures.studentB = studentB!.id;

  const [bm] = await db.insert(subjects).values({ code: `BM-${tag}`, nameMs: 'Bahasa Melayu' }).returning({ id: subjects.id });
  const [en] = await db.insert(subjects).values({ code: `EN-${tag}`, nameMs: 'Bahasa Inggeris' }).returning({ id: subjects.id });
  fixtures.subjectBM = bm!.id;
  fixtures.subjectEN = en!.id;

  const a = await makeStaffWithUser('TeacherA');
  const b = await makeStaffWithUser('TeacherB');
  fixtures.teacherAStaff = a.staffId;
  fixtures.teacherBStaff = b.staffId;
  fixtures.teacherA = a.user;
  fixtures.teacherB = b.user;

  // Teacher A homeroom of Class A; Teacher B has an assignment in Class B.
  await db.update(classes).set({ classTeacherId: fixtures.teacherAStaff }).where(eq(classes.id, fixtures.classA));
  await db.insert(teachingAssignments).values({
    academicYearId: fixtures.yearA,
    teacherId: fixtures.teacherBStaff,
    classId: fixtures.classB,
    subjectId: fixtures.subjectBM,
    isPrimary: true,
  });

  await db.insert(enrollments).values([
    { studentId: fixtures.studentA, classId: fixtures.classA, academicYearId: fixtures.yearA, enrolledAt: '2026-01-05', status: 'ACTIVE' },
    { studentId: fixtures.studentB, classId: fixtures.classB, academicYearId: fixtures.yearA, enrolledAt: '2026-01-05', status: 'ACTIVE' },
  ]);
});

run('subject code is stable and unique', async () => {
  await assert.rejects(
    db.insert(subjects).values({ code: `BM-${tag}`, nameMs: 'Duplikat' }),
    (err: Error & { cause?: { code?: string } }) => /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('inactive subject is excluded from active filters', async () => {
  const [row] = await db.insert(subjects).values({ code: `OFF-${tag}`, nameMs: 'Tidak Aktif', isActive: false }).returning({ id: subjects.id });
  const active = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.isActive, true));
  assert.ok(!active.some((s) => s.id === row!.id));
});

run('one enrollment per student per year is enforced', async () => {
  await assert.rejects(
    db.insert(enrollments).values({
      studentId: fixtures.studentA,
      classId: fixtures.classB,
      academicYearId: fixtures.yearA,
      enrolledAt: '2026-02-01',
      status: 'ACTIVE',
    }),
    (err: Error & { cause?: { code?: string } }) => /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('duplicate teaching assignment is rejected', async () => {
  await assert.rejects(
    db.insert(teachingAssignments).values({
      academicYearId: fixtures.yearA,
      teacherId: fixtures.teacherBStaff,
      classId: fixtures.classB,
      subjectId: fixtures.subjectBM,
    }),
    (err: Error & { cause?: { code?: string } }) => /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('teacher A scopes to class A only', async () => {
  const classScope = await getTeacherClassIds(db, fixtures.teacherA);
  assert.equal(classScope.unrestricted, false);
  if (!classScope.unrestricted) {
    assert.deepEqual(classScope.classIds, [fixtures.classA]);
  }
});

run('teacher A sees Student A but not Student B', async () => {
  const studentScope = await getTeacherStudentIds(db, fixtures.teacherA);
  assert.equal(studentScope.unrestricted, false);
  if (!studentScope.unrestricted) {
    assert.ok(studentScope.ids.includes(fixtures.studentA));
    assert.ok(!studentScope.ids.includes(fixtures.studentB));
  }
});

run('teacher B scopes through teaching assignment, not homeroom', async () => {
  const classScope = await getTeacherClassIds(db, fixtures.teacherB);
  assert.equal(classScope.unrestricted, false);
  if (!classScope.unrestricted) assert.deepEqual(classScope.classIds, [fixtures.classB]);
});

run('teacher without staff record sees zero students', async () => {
  const orphan: ApplicationUser = {
    profileId: randomUUID(),
    authUserId: 'none',
    email: 'orphan@srik.test',
    displayName: 'Orphan',
    roles: ['TEACHER'],
    permissions: [],
    mustChangePassword: false,
  };
  const scope = await getTeacherStudentIds(db, orphan);
  assert.equal(scope.unrestricted, false);
  if (!scope.unrestricted) assert.deepEqual(scope.ids, []);
});

run('closed academic year is flagged read-only by status', async () => {
  const [row] = await db.select({ status: academicYears.status }).from(academicYears).where(eq(academicYears.id, fixtures.yearClosed));
  assert.equal(row!.status, 'CLOSED');
});

after(async () => {
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
