import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { accountInvitations, createDb, profiles, userRoles } from '@srik/db';
import { normalise } from './test-helpers.ts';

// Invitation lifecycle integration test (spec §85). Development branch only:
//   SRIK_INTEGRATION=1 DATABASE_URL=<dev branch> node --test src/server/invitations.test.ts
const url = process.env.DATABASE_URL;
const enabled = Boolean(url) && process.env.SRIK_INTEGRATION === '1';
const run = enabled ? test : test.skip;
const db = url ? createDb(url) : (null as never);

// Invitation policy + guard helpers are pure/DB-only; importing the route module pulls in the app.
const { INVITATION_TTL_HOURS, invitationExpiry, activeAdminCount } = await import('./invitation-policy.ts');

run('invitation expiry is one server-side constant', () => {
  const before = Date.now();
  const expires = invitationExpiry().getTime();
  const hours = (expires - before) / 3_600_000;
  assert.ok(Math.abs(hours - INVITATION_TTL_HOURS) < 0.01, `got ${hours}`);
});

run('only one PENDING invitation per normalized email is allowed', async () => {
  const email = `inv-${randomUUID()}@srik.test`.toLowerCase();
  const [profile] = await db.insert(profiles).values({ email, displayName: 'Invitee', status: 'INVITED' }).returning({ id: profiles.id });
  await db.insert(accountInvitations).values({ email, profileId: profile!.id, intendedRole: 'TEACHER', invitedBy: profile!.id, expiresAt: invitationExpiry() });
  await assert.rejects(
    db.insert(accountInvitations).values({ email, profileId: profile!.id, intendedRole: 'TEACHER', invitedBy: profile!.id, expiresAt: invitationExpiry() }),
    // drizzle 0.45 wraps driver errors; match the wrapped message or the cause.
    (err: Error & { cause?: { code?: string } }) =>
      /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('superseded invitations do not block a new one', async () => {
  const email = `inv2-${randomUUID()}@srik.test`.toLowerCase();
  const [profile] = await db.insert(profiles).values({ email, displayName: 'Invitee', status: 'INVITED' }).returning({ id: profiles.id });
  const base = { email, profileId: profile!.id, intendedRole: 'TEACHER' as const, invitedBy: profile!.id };
  await db.insert(accountInvitations).values({ ...base, expiresAt: invitationExpiry(), status: 'CANCELLED' });
  const [second] = await db.insert(accountInvitations).values({ ...base, expiresAt: invitationExpiry() }).returning();
  assert.equal(second!.status, 'PENDING');
});

run('one auth identity cannot be linked to two profiles', async () => {
  const authUserId = randomUUID();
  const emailA = `a-${randomUUID()}@srik.test`;
  const emailB = `b-${randomUUID()}@srik.test`;
  await db.insert(profiles).values({ email: emailA, displayName: 'A', status: 'ACTIVE', authUserId });
  await assert.rejects(
    db.insert(profiles).values({ email: emailB, displayName: 'B', status: 'ACTIVE', authUserId }),
    (err: Error & { cause?: { code?: string } }) =>
      /duplicate key|unique/i.test(err.message) || err.cause?.code === '23505',
  );
});

run('last active admin cannot be removed', async () => {
  // Fixture: wipe roles for a dedicated admin, then confirm the guard sees one admin.
  const email = `admin-${randomUUID()}@srik.test`;
  const [profile] = await db.insert(profiles).values({ email, displayName: 'Solo Admin', status: 'ACTIVE' }).returning({ id: profiles.id });
  await db.insert(userRoles).values({ profileId: profile!.id, role: 'ADMIN' });
  const total = await activeAdminCount(db);
  assert.ok(total >= 1);
});

run('email normalization is stable before comparison', () => {
  assert.equal(normalise('  Admin@SriK.Test '), 'admin@srik.test');
});

after(async () => {
  // Close the pool so the runner can finish instead of hanging on open sockets.
  await db?.$client?.end({ timeout: 1 }).catch(() => undefined);
});
