import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq } from 'drizzle-orm';
import { accountInvitations, profiles, staff, userRoles } from '@srik/db';
import { normalizeEmail } from '@srik/shared';
import { writeAudit } from './audit.ts';
import type { AppEnv } from '../types.ts';

/**
 * Invitation acceptance (spec §63, §71). Everything that grants access is derived server-side
 * from the verified identity + invitation row; the browser never supplies a profile, role or
 * auth user id.
 */
export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.get('/status', async (c) => {
  const identity = c.var.identity;
  if (!identity) return c.json({ data: { state: 'signed-out' }, requestId: c.var.requestId });
  if (c.var.user) return c.json({ data: { state: 'authenticated-active', user: c.var.user }, requestId: c.var.requestId });

  const email = normalizeEmail(identity.email);
  const [invitation] = await c.var.db
    .select({ id: accountInvitations.id, status: accountInvitations.status, expiresAt: accountInvitations.expiresAt })
    .from(accountInvitations)
    .where(and(eq(accountInvitations.email, email), eq(accountInvitations.status, 'PENDING')))
    .orderBy(desc(accountInvitations.createdAt))
    .limit(1);

  const state = !invitation
    ? 'no-invitation'
    : invitation.expiresAt.getTime() < Date.now()
      ? 'invitation-expired'
      : 'invitation-pending';
  return c.json({ data: { state, email, invitationId: invitation?.id ?? null }, requestId: c.var.requestId });
});

onboardingRoutes.post('/accept', async (c) => {
  const identity = c.var.identity;
  if (!identity) throw new HTTPException(401, { message: 'Sila log masuk.', cause: { code: 'AUTH_REQUIRED' } });
  if (c.var.user) return c.json({ data: { state: 'authenticated-active', user: c.var.user }, requestId: c.var.requestId });

  const email = normalizeEmail(identity.email);
  const db = c.var.db;

  const [pending] = await db
    .select()
    .from(accountInvitations)
    .where(and(eq(accountInvitations.email, email), eq(accountInvitations.status, 'PENDING')))
    .orderBy(desc(accountInvitations.createdAt))
    .limit(1);
  if (!pending) {
    throw new HTTPException(403, { message: 'Tiada jemputan aktif untuk akaun ini.', cause: { code: 'INVITATION_NOT_FOUND' } });
  }
  if (pending.expiresAt.getTime() < Date.now()) {
    await db.update(accountInvitations).set({ status: 'EXPIRED', updatedAt: new Date() }).where(eq(accountInvitations.id, pending.id));
    throw new HTTPException(409, { message: 'Jemputan telah tamat tempoh.', cause: { code: 'INVITATION_EXPIRED' } });
  }

  const result = await db.transaction(async (tx) => {
    // Claim the invitation first: only one acceptance can win, even under concurrency.
    const [claimed] = await tx
      .update(accountInvitations)
      .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(accountInvitations.id, pending.id), eq(accountInvitations.status, 'PENDING')))
      .returning();
    if (!claimed) throw new HTTPException(409, { message: 'Jemputan ini telah digunakan.', cause: { code: 'INVITATION_NOT_FOUND' } });

    // One profile per auth identity, one auth identity per profile.
    const [linkedElsewhere] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.authUserId, identity.authUserId))
      .limit(1);
    if (linkedElsewhere && linkedElsewhere.id !== claimed.profileId) {
      throw new HTTPException(409, { message: 'Identiti ini sudah dipautkan.', cause: { code: 'AUTH_ALREADY_LINKED' } });
    }

    const [profile] = await tx
      .select({ id: profiles.id, email: profiles.email, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, claimed.profileId!))
      .for('update')
      .limit(1);
    if (!profile) throw new HTTPException(404, { message: 'Profil tidak dijumpai.', cause: { code: 'INVITATION_NOT_FOUND' } });
    if (normalizeEmail(profile.email) !== email) {
      throw new HTTPException(403, { message: 'Emel tidak sepadan dengan jemputan.', cause: { code: 'INVITATION_EMAIL_MISMATCH' } });
    }

    await tx.update(profiles).set({ authUserId: identity.authUserId, status: 'ACTIVE', updatedAt: new Date() }).where(eq(profiles.id, profile.id));
    await tx
      .insert(userRoles)
      .values({ profileId: profile.id, role: claimed.intendedRole })
      .onConflictDoNothing();
    if (claimed.staffId) await tx.update(staff).set({ profileId: profile.id }).where(eq(staff.id, claimed.staffId));

    return { profileId: profile.id, roles: [claimed.intendedRole] };
  });

  await writeAudit(db, {
    actorId: result.profileId,
    action: 'USER_LINKED_AUTH',
    resourceType: 'profile',
    resourceId: result.profileId,
    after: { authUserId: identity.authUserId, invitationId: pending.id, roles: result.roles },
    requestId: c.var.requestId,
  });

  return c.json({ data: { state: 'authenticated-active', profileId: result.profileId }, requestId: c.var.requestId });
});
