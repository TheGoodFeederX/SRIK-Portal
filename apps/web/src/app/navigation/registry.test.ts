import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTFOLIOS, availableFor, canOpen, registry } from './portfolioRegistry.ts';

const admin = { roles: ['ADMIN'], permissions: ['staff.read', 'student.read', 'attendance.student.read', 'system.audit.read'] };
const teacher = { roles: ['TEACHER'], permissions: ['staff.read', 'student.read', 'attendance.student.read', 'attendance.student.take'] };

test('every portfolio has entries and unique ids/paths', () => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const p of PORTFOLIOS) assert.ok(registry.some((e) => e.portfolio === p.id), p.id);
  for (const e of registry) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    assert.ok(!paths.has(e.path), `duplicate path ${e.path}`);
    ids.add(e.id);
    paths.add(e.path);
  }
});

test('only available entries are shown in navigation', () => {
  for (const p of PORTFOLIOS) {
    for (const e of availableFor(admin, p.id)) assert.equal(e.readiness, 'available');
  }
});

test('teacher never sees audit log; admin does', () => {
  const adminPaths = registry.filter((e) => canOpen(admin, e)).map((e) => e.path);
  const teacherPaths = registry.filter((e) => canOpen(teacher, e)).map((e) => e.path);
  assert.ok(adminPaths.includes('/app/administration/audit-log'));
  assert.ok(!teacherPaths.includes('/app/administration/audit-log'));
});

test('anonymous user sees nothing', () => {
  assert.equal(availableFor(null, 'administration').length, 0);
  assert.equal(registry.some((e) => canOpen(null, e)), false);
});
