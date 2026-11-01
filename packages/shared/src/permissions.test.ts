import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSIONS, RESERVED_PERMISSIONS, ROLE_PERMISSIONS, can, permissionsForRoles, type Role } from './permissions.ts';
import { normalizeEmail } from './auth-codes.ts';

const roles: Role[] = ['ADMIN', 'TEACHER'];

test('every owned permission is granted to at least one role', () => {
  const granted = new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
  for (const p of PERMISSIONS) assert.ok(granted.has(p), `ungranted permission ${p}`);
});

test('reserved permissions are granted to nobody', () => {
  const granted = new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
  for (const p of RESERVED_PERMISSIONS) assert.ok(!granted.has(p as never), `reserved permission granted: ${p}`);
});

test('role permission lists only contain owned permissions', () => {
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) assert.ok(PERMISSIONS.includes(p));
});

test('teacher cannot manage system, audit, classes or write students', () => {
  const t = { roles: ['TEACHER' as const] };
  for (const p of ['system.audit.read', 'system.user.manage', 'student.write', 'staff.write', 'academic.class.manage'] as const) {
    assert.equal(can(t, p), false, p);
  }
});

test('teacher can read students, take attendance and read academic data', () => {
  const t = { roles: ['TEACHER' as const] };
  for (const p of ['student.read', 'attendance.student.take', 'academic.class.read', 'academic.subject.read', 'timetable.read'] as const) {
    assert.equal(can(t, p), true, p);
  }
});

test('admin holds the full permission set', () => {
  assert.equal(permissionsForRoles(['ADMIN']).length, PERMISSIONS.length);
});

test('anonymous user has no permission', () => {
  assert.equal(can(null, 'student.read'), false);
});

test('permissionsForRoles deduplicates', () => {
  assert.equal(permissionsForRoles(['ADMIN', 'ADMIN']).length, PERMISSIONS.length);
});

test('email normalization trims and lowercases', () => {
  assert.equal(normalizeEmail('  Admin@SRIK.Local '), 'admin@srik.local');
  assert.equal(normalizeEmail('A@B.C'), 'a@b.c');
});
