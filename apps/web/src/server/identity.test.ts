import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSessionPayload, readAuthToken, verifyIdentity } from './auth/identity.ts';

const sessionPayload = {
  user: { id: 'auth-1', email: 'Guru@SRIK.Local', emailVerified: true },
  session: { id: 'sess-1' },
};

test('session payload maps to a normalized identity', () => {
  assert.deepEqual(mapSessionPayload(sessionPayload), {
    authUserId: 'auth-1',
    email: 'guru@srik.local',
    emailVerified: true,
  });
});

test('malformed payloads are rejected', () => {
  assert.equal(mapSessionPayload(null), null);
  assert.equal(mapSessionPayload({}), null);
  assert.equal(mapSessionPayload({ user: { id: 1 } }), null);
  assert.equal(mapSessionPayload({ user: { email: 'a@b.c' } }), null);
});

test('token is read from bearer header first, then the managed auth cookie', () => {
  assert.equal(readAuthToken({ authorization: 'Bearer abc' }), 'abc');
  assert.equal(readAuthToken({ cookie: 'better-auth.session_token=xyz; other=1' }), 'xyz');
  assert.equal(readAuthToken({ cookie: '__Secure-better-auth.session_token=sec' }), 'sec');
  assert.equal(readAuthToken({ cookie: 'unrelated=1' }), null);
  assert.equal(readAuthToken({}), null);
});

const stubFetch = (status: number, body: unknown = null) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as (i: string, n: RequestInit) => Promise<Response>;

test('verification without a token never calls the auth service', async () => {
  let called = false;
  const result = await verifyIdentity({}, { baseUrl: 'https://auth.test', fetchImpl: (async () => { called = true; return new Response(); }) as never });
  assert.equal(result.kind, 'none');
  assert.equal(called, false);
});

test('valid session resolves identity', async () => {
  const result = await verifyIdentity(
    { authorization: 'Bearer t' },
    { baseUrl: 'https://auth.test/', fetchImpl: stubFetch(200, sessionPayload) },
  );
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') assert.equal(result.identity.authUserId, 'auth-1');
});

test('401 from the auth service means unauthenticated, not an error', async () => {
  const result = await verifyIdentity({ authorization: 'Bearer t' }, { baseUrl: 'https://auth.test', fetchImpl: stubFetch(401) });
  assert.equal(result.kind, 'invalid');
});

test('network failure is treated as invalid identity (never as active)', async () => {
  const result = await verifyIdentity(
    { authorization: 'Bearer t' },
    {
      baseUrl: 'https://auth.test',
      fetchImpl: (async () => {
        throw new Error('boom');
      }) as never,
    },
  );
  assert.equal(result.kind, 'invalid');
});

test('missing base url disables authentication entirely', async () => {
  const result = await verifyIdentity({ authorization: 'Bearer t' }, {});
  assert.equal(result.kind, 'none');
});
