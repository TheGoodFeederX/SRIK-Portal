import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app.ts';

// Unauthenticated contract checks. No DB and no auth service needed: these never reach a query.
const json = async (res: Response) => (await res.json()) as { data?: unknown; error?: { code: string; message: string } };

test('health endpoint responds', async () => {
  const res = await app.request('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-request-id')?.length, 36);
});

test('session endpoint reports signed-out state when unauthenticated', async () => {
  const res = await app.request('/api/v1/auth/session');
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).data, { state: 'signed-out', user: null });
});

test('protected routes reject anonymous requests with AUTH_REQUIRED', async () => {
  for (const [method, path] of [
    ['GET', '/api/v1/students'],
    ['GET', '/api/v1/staff'],
    ['GET', '/api/v1/audit-log'],
    ['GET', '/api/v1/users'],
    ['POST', '/api/v1/users/invitations'],
    ['POST', '/api/v1/attendance/students'],
  ] as const) {
    const res = await app.request(path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal((await json(res)).error?.code, 'AUTH_REQUIRED', `${method} ${path}`);
  }
});

test('legacy password login endpoint no longer exists', async () => {
  const res = await app.request('/api/v1/auth/login', { method: 'POST' });
  assert.equal(res.status, 404);
});

test('onboarding acceptance requires an authenticated identity', async () => {
  const res = await app.request('/api/v1/onboarding/accept', { method: 'POST' });
  assert.equal(res.status, 401);
  assert.equal((await json(res)).error?.code, 'AUTH_REQUIRED');
});

test('onboarding status is signed-out without identity', async () => {
  const res = await app.request('/api/v1/onboarding/status');
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).data, { state: 'signed-out' });
});

test('error responses never leak stack traces', async () => {
  for (const path of ['/api/v1/students', '/api/v1/users']) {
    const res = await app.request(path);
    const text = await res.text();
    assert.ok(!/at \w+ \(|node_modules|select /i.test(text), text);
  }
});
