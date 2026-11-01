import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDb, profiles, userRoles } from '@srik/db';
import { resolveApplicationUser } from './auth/application-user.ts';
import type { AuthIdentity } from './types.ts';

// Integration test: needs DATABASE_URL pointing at a NON-production branch (spec §91).
const url = process.env.DATABASE_URL;
// Integration specs need a NON-production database (spec §91): SRIK_INTEGRATION=1 + DATABASE_URL.
const enabled = Boolean(url) && process.env.SRIK_INTEGRATION === '1';
const run = enabled ? test : test.skip;
const db = url ? createDb(url) : (null as never);

const identity = (authUserId: string, email: string): AuthIdentity => ({ authUserId, email, emailVerified: true });
const seedProfile = async (status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED', authUserId: string | null, withRole: boolean) => {
  const email = `t-${randomUUID()}@srik.test`;
  const [row] = await db.insert(profiles).values({ email, displayName: 'Test', status, authUserId }).returning({ id: profiles.id });
  if (withRole) await db.insert(userRoles).values({ profileId: row!.id, role: 'TEACHER' });
  return { id: row!.id, email };
};

run('unlinked auth identity is denied with APP_PROFILE_NOT_LINKED', async () => {
  const result = await resolveApplicationUser(db, identity(randomUUID(), 'nobody@srik.test'));
  assert.equal(result.kind, 'denied');
  if (result.kind === 'denied') assert.equal(result.denial.code, 'APP_PROFILE_NOT_LINKED');
});

run('INVITED profile is denied with APP_ACCOUNT_INVITED', async () => {
  const authUserId = randomUUID();
  const { email } = await seedProfile('INVITED', authUserId, true);
  const result = await resolveApplicationUser(db, identity(authUserId, email));
  assert.equal(result.kind, 'denied');
  if (result.kind === 'denied') assert.equal(result.denial.code, 'APP_ACCOUNT_INVITED');
});

run('SUSPENDED profile is denied with APP_ACCOUNT_SUSPENDED', async () => {
  const authUserId = randomUUID();
  const { email } = await seedProfile('SUSPENDED', authUserId, true);
  const result = await resolveApplicationUser(db, identity(authUserId, email));
  assert.equal(result.kind, 'denied');
  if (result.kind === 'denied') assert.equal(result.denial.code, 'APP_ACCOUNT_SUSPENDED');
});

run('DISABLED profile is denied with APP_ACCOUNT_DISABLED', async () => {
  const authUserId = randomUUID();
  const { email } = await seedProfile('DISABLED', authUserId, true);
  const result = await resolveApplicationUser(db, identity(authUserId, email));
  assert.equal(result.kind, 'denied');
  if (result.kind === 'denied') assert.equal(result.denial.code, 'APP_ACCOUNT_DISABLED');
});

run('roleless ACTIVE profile is denied with APP_ROLE_NOT_ASSIGNED', async () => {
  const authUserId = randomUUID();
  const { email } = await seedProfile('ACTIVE', authUserId, false);
  const result = await resolveApplicationUser(db, identity(authUserId, email));
  assert.equal(result.kind, 'denied');
  if (result.kind === 'denied') assert.equal(result.denial.code, 'APP_ROLE_NOT_ASSIGNED');
});

run('ACTIVE TEACHER resolves with teacher permissions only', async () => {
  const authUserId = randomUUID();
  const { email } = await seedProfile('ACTIVE', authUserId, true);
  const result = await resolveApplicationUser(db, identity(authUserId, email));
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.deepEqual(result.user.roles, ['TEACHER']);
    assert.ok(result.user.permissions.includes('student.read'));
    assert.ok(!result.user.permissions.includes('system.user.manage'));
  }
});

after(async () => {
  // Close the pool so the runner can finish instead of hanging on open sockets.
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
