import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app.ts';

// Unauthenticated contract checks. No DB needed: these never reach a query.
test('health endpoint responds', async () => {
  const res = await app.request('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-request-id')?.length, 36);
});

test('session endpoint returns null user when not logged in', async () => {
  const res = await app.request('/api/v1/auth/session');
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: unknown }).data, null);
});

test('protected routes reject anonymous requests', async () => {
  for (const [method, path] of [
    ['GET', '/api/v1/students'],
    ['GET', '/api/v1/staff'],
    ['GET', '/api/v1/audit-log'],
    ['POST', '/api/v1/attendance/students'],
  ] as const) {
    const res = await app.request(path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'UNAUTHORIZED');
  }
});

test('login rejects malformed body without touching the database', async () => {
  const res = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'VALIDATION');
});

test('error responses never leak stack traces', async () => {
  const res = await app.request('/api/v1/students');
  const text = await res.text();
  assert.ok(!/at \w+ \(|node_modules|select /i.test(text), text);
});
