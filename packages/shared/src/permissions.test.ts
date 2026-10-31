import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSIONS, ROLE_PERMISSIONS, can, permissionsForRoles, type Role } from './permissions.ts';

const roles: Role[] = ['ADMIN', 'TEACHER'];

test('every permission is granted to at least one role', () => {
  const granted = new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
  for (const p of PERMISSIONS) assert.ok(granted.has(p), `ungranted permission ${p}`);
});

test('role permission lists only contain declared permissions', () => {
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) assert.ok(PERMISSIONS.includes(p));
});

test('teacher cannot manage system, audit, classes or write students', () => {
  const t = { roles: ['TEACHER' as const] };
  assert.equal(can(t, 'system.audit.read'), false);
  assert.equal(can(t, 'system.user.manage'), false);
  assert.equal(can(t, 'student.write'), false);
  assert.equal(can(t, 'academic.class.manage'), false);
});

test('teacher can read students and take attendance', () => {
  const t = { roles: ['TEACHER' as const] };
  assert.equal(can(t, 'student.read'), true);
  assert.equal(can(t, 'attendance.student.take'), true);
});

test('anonymous user has no permission', () => {
  assert.equal(can(null, 'student.read'), false);
});

test('permissionsForRoles deduplicates', () => {
  const p = permissionsForRoles(['ADMIN', 'ADMIN']);
  assert.equal(p.length, PERMISSIONS.length);
});
