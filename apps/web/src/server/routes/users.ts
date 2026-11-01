import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { accountInvitations, profiles, staff, userRoles } from '@srik/db';
import { normalizeEmail, type Role } from '@srik/shared';
import { requirePermission, requireUser } from '../auth/session.ts';
import { idParam, parse } from '../app.ts';
import { writeAudit } from './audit.ts';
import { activeAdminCount, invitationExpiry } from '../invitation-policy.ts';
import { deleteIdentity, generateTemporaryPassword, provisionIdentity, setCredentialPassword, updateIdentityEmail } from '../auth/credentials.ts';
import type { AppEnv } from '../types.ts';


const inviteInput = z.object({
  email: z.string().trim().email().max(255),
  staffId: z.string().uuid().nullish(),
  intendedRole: z.enum(['ADMIN', 'TEACHER']).default('TEACHER'),
});

const roleInput = z.object({ roles: z.array(z.enum(['ADMIN', 'TEACHER'])).max(2) });

const provisionInput = z.object({
  email: z.string().trim().email().max(255),
  staffId: z.string().uuid().nullish(),
  intendedRole: z.enum(['ADMIN', 'TEACHER']).default('TEACHER'),
  displayName: z.string().trim().min(1).max(200).optional(),
});

const emailInput = z.object({ email: z.string().trim().email().max(255) });

export const userRoutes = new Hono<AppEnv>();

const manage = requirePermission('system.user.manage');


/**
 * Account provisioning (spec R2 §5): profile + auth identity + temporary password + role,
 * all server-side and without email delivery. The temporary password is returned exactly once.
 */
userRoutes.post('/provision', manage, async (c) => {
  const actor = requireUser(c);
  const input = parse(provisionInput, await c.req.json().catch(() => ({})));
  const email = normalizeEmail(input.email);
  const db = c.var.db;

  let staffRow: { id: string; fullName: string; profileId: string | null } | undefined;
  if (input.staffId) {
    [staffRow] = await db
      .select({ id: staff.id, fullName: staff.fullName, profileId: staff.profileId })
      .from(staff)
      .where(eq(staff.id, input.staffId))
      .limit(1);
    if (!staffRow) throw new HTTPException(404, { message: 'Rekod guru tidak dijumpai.', cause: { code: 'INVALID_TEACHER' } });
    if (staffRow.profileId) throw new HTTPException(409, { message: 'Guru ini sudah mempunyai akaun.', cause: { code: 'AUTH_ALREADY_LINKED' } });
  }

  const [existing] = await db.select({ id: profiles.id, authUserId: profiles.authUserId }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing?.authUserId) {
    throw new HTTPException(409, { message: 'Emel ini sudah mempunyai akaun aktif.', cause: { code: 'AUTH_ALREADY_LINKED' } });
  }

  const displayName = input.displayName ?? staffRow?.fullName ?? email;
  const { authUserId, temporaryPassword } = await provisionIdentity(email, displayName);

  const profileId = await db.transaction(async (tx) => {
    let id = existing?.id;
    if (id) {
      await tx
        .update(profiles)
        .set({ authUserId, displayName, status: 'ACTIVE', mustChangePassword: true, updatedAt: new Date() })
        .where(eq(profiles.id, id));
    } else {
      const [created] = await tx
        .insert(profiles)
        .values({ email, displayName, status: 'ACTIVE', authUserId, mustChangePassword: true })
        .returning({ id: profiles.id });
      id = created!.id;
    }
    await tx.insert(userRoles).values({ profileId: id, role: input.intendedRole }).onConflictDoNothing();
    if (staffRow) await tx.update(staff).set({ profileId: id }).where(eq(staff.id, staffRow.id));
    return id;
  });

  await db
    .update(accountInvitations)
    .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accountInvitations.email, email), eq(accountInvitations.status, 'PENDING')));

  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_INVITED',
    resourceType: 'profile',
    resourceId: profileId,
    // Never store the temporary password.
    after: { email, intendedRole: input.intendedRole, staffId: staffRow?.id ?? null, provisioned: true },
    requestId: c.var.requestId,
  });

  return c.json(
    {
      data: { profileId, email, intendedRole: input.intendedRole, temporaryPassword, mustChangePassword: true },
      requestId: c.var.requestId,
    },
    201,
  );
});

/** Admin-driven password reset without email (spec R2 §7, §12). */
userRoutes.post('/:id/reset-password', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const db = c.var.db;
  const [target] = await db
    .select({ id: profiles.id, email: profiles.email, authUserId: profiles.authUserId, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!target) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });
  if (!target.authUserId) {
    throw new HTTPException(409, { message: 'Pengguna ini belum mempunyai identiti pengesahan.', cause: { code: 'APP_PROFILE_NOT_LINKED' } });
  }

  const temporaryPassword = generateTemporaryPassword();
  await setCredentialPassword(target.authUserId, temporaryPassword);
  await db.update(profiles).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(profiles.id, id));
  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_PASSWORD_RESET',
    resourceType: 'profile',
    resourceId: id,
    requestId: c.var.requestId,
  });

  return c.json({ data: { profileId: id, temporaryPassword, mustChangePassword: true }, requestId: c.var.requestId });
});

/** Alias email change (spec R2 §14). */
userRoutes.put('/:id/email', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const { email } = parse(emailInput, await c.req.json().catch(() => ({})));
  const next = normalizeEmail(email);
  const db = c.var.db;
  const [target] = await db.select({ id: profiles.id, email: profiles.email, authUserId: profiles.authUserId }).from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!target) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });

  const [clash] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, next)).limit(1);
  if (clash && clash.id !== id) throw new HTTPException(409, { message: 'Emel ini sudah digunakan.', cause: { code: 'CONFLICT' } });

  await db.transaction(async (tx) => {
    await tx.update(profiles).set({ email: next, updatedAt: new Date() }).where(eq(profiles.id, id));
    if (target.authUserId) await updateIdentityEmail(target.authUserId, next);
  });
  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_ALIAS_EMAIL_CHANGED',
    resourceType: 'profile',
    resourceId: id,
    before: { email: target.email },
    after: { email: next },
    requestId: c.var.requestId,
  });
  return c.json({ data: { profileId: id, email: next }, requestId: c.var.requestId });
});

/** Cancel provisioning: removes the identity and the unused profile. */
userRoutes.delete('/:id', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const db = c.var.db;
  await assertNotLastAdmin(db, id, 'deny');
  const [target] = await db.select({ authUserId: profiles.authUserId, email: profiles.email }).from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!target) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });
  if (target.authUserId) await deleteIdentity(target.authUserId);
  await db.transaction(async (tx) => {
    await tx.update(staff).set({ profileId: null }).where(eq(staff.profileId, id));
    await tx.delete(accountInvitations).where(eq(accountInvitations.profileId, id));
    await tx.delete(profiles).where(eq(profiles.id, id));
  });
  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_DELETED',
    resourceType: 'profile',
    resourceId: id,
    before: { email: target.email },
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});

/** List application identities with staff link + invitation state (spec §26). */
userRoutes.get('/', manage, async (c) => {
  const rows = await c.var.db
    .select({
      profileId: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      status: profiles.status,
      authUserId: profiles.authUserId,
      updatedAt: profiles.updatedAt,
      staffId: staff.id,
      staffName: staff.fullName,
      roles: sql<Role[]>`coalesce((select array_agg(ur.role::text) from user_roles ur where ur.profile_id = ${profiles.id}), '{}')`,
      invitationStatus: sql<string | null>`(
        select ai.status::text from account_invitations ai
        where ai.profile_id = ${profiles.id}
        order by ai.created_at desc limit 1
      )`,
      invitationExpiresAt: sql<string | null>`(
        select ai.expires_at::text from account_invitations ai
        where ai.profile_id = ${profiles.id}
        order by ai.created_at desc limit 1
      )`,
    })
    .from(profiles)
    .leftJoin(staff, eq(staff.profileId, profiles.id))
    .orderBy(desc(profiles.updatedAt))
    .limit(200);

  const now = Date.now();
  const data = rows.map((r) => ({
    ...r,
    invitationStatus:
      r.invitationStatus === 'PENDING' && r.invitationExpiresAt && new Date(r.invitationExpiresAt).getTime() < now
        ? 'EXPIRED'
        : r.invitationStatus,
  }));
  return c.json({ data, requestId: c.var.requestId });
});

userRoutes.get('/:id', manage, async (c) => {
  const id = idParam(c);
  const [row] = await c.var.db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });
  const invitations = await c.var.db
    .select()
    .from(accountInvitations)
    .where(eq(accountInvitations.profileId, id))
    .orderBy(desc(accountInvitations.createdAt));
  return c.json({ data: { ...row, invitations }, requestId: c.var.requestId });
});

/**
 * Invite a teacher (spec §28–29): pre-provision an INVITED profile, link staff, store the
 * invitation. Never creates an auth credential, never emails a password.
 */
userRoutes.post('/invitations', manage, async (c) => {
  const actor = requireUser(c);
  const input = parse(inviteInput, await c.req.json().catch(() => ({})));
  const email = normalizeEmail(input.email);
  const db = c.var.db;

  let staffRow: { id: string; fullName: string; profileId: string | null } | undefined;
  if (input.staffId) {
    [staffRow] = await db
      .select({ id: staff.id, fullName: staff.fullName, profileId: staff.profileId })
      .from(staff)
      .where(eq(staff.id, input.staffId))
      .limit(1);
    if (!staffRow) throw new HTTPException(404, { message: 'Rekod guru tidak dijumpai.' });
    if (staffRow.profileId) {
      throw new HTTPException(409, { message: 'Guru ini sudah mempunyai akaun.', cause: { code: 'AUTH_ALREADY_LINKED' } });
    }
  }

  const [pending] = await db
    .select({ id: accountInvitations.id })
    .from(accountInvitations)
    .where(and(eq(accountInvitations.email, email), eq(accountInvitations.status, 'PENDING')))
    .limit(1);
  if (pending) throw new HTTPException(409, { message: 'Jemputan aktif sudah wujud untuk emel ini.' });

  const [existing] = await db.select({ id: profiles.id, authUserId: profiles.authUserId }).from(profiles).where(eq(profiles.email, email)).limit(1);

  const invitation = await db.transaction(async (tx) => {
    let profileId = existing?.id;
    if (!profileId) {
      const [created] = await tx
        .insert(profiles)
        .values({
          email,
          displayName: staffRow?.fullName ?? email,
          status: 'INVITED',
        })
        .returning({ id: profiles.id });
      profileId = created!.id;
    }
    if (staffRow) await tx.update(staff).set({ profileId }).where(eq(staff.id, staffRow.id));
    const [row] = await tx
      .insert(accountInvitations)
      .values({
        email,
        profileId,
        intendedRole: input.intendedRole,
        staffId: staffRow?.id ?? null,
        invitedBy: actor.profileId,
        expiresAt: invitationExpiry(),
      })
      .returning();
    return row!;
  });

  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_INVITED',
    resourceType: 'profile',
    resourceId: invitation.profileId,
    after: { email, intendedRole: input.intendedRole, staffId: staffRow?.id ?? null },
    requestId: c.var.requestId,
  });

  return c.json({ data: invitation, requestId: c.var.requestId }, 201);
});

/** Resend: renew expiry on the same profile, supersede the previous PENDING row (spec §65). */
userRoutes.post('/invitations/:id/resend', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const db = c.var.db;
  const [invitation] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, id)).limit(1);
  if (!invitation) throw new HTTPException(404, { message: 'Jemputan tidak dijumpai.', cause: { code: 'INVITATION_NOT_FOUND' } });
  if (invitation.status !== 'PENDING') throw new HTTPException(409, { message: 'Jemputan ini tidak lagi aktif.' });

  const row = await db.transaction(async (tx) => {
    await tx.update(accountInvitations).set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() }).where(eq(accountInvitations.id, id));
    const [renewed] = await tx
      .insert(accountInvitations)
      .values({
        email: invitation.email,
        profileId: invitation.profileId,
        intendedRole: invitation.intendedRole,
        staffId: invitation.staffId,
        invitedBy: actor.profileId,
        expiresAt: invitationExpiry(),
      })
      .returning();
    return renewed!;
  });

  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'INVITATION_RESENT',
    resourceType: 'account_invitation',
    resourceId: row.id,
    after: { email: invitation.email, expiresAt: row.expiresAt },
    requestId: c.var.requestId,
  });
  return c.json({ data: row, requestId: c.var.requestId }, 201);
});

userRoutes.post('/invitations/:id/cancel', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const [updated] = await c.var.db
    .update(accountInvitations)
    .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accountInvitations.id, id), eq(accountInvitations.status, 'PENDING')))
    .returning();
  if (!updated) throw new HTTPException(404, { message: 'Jemputan aktif tidak dijumpai.', cause: { code: 'INVITATION_NOT_FOUND' } });
  await writeAudit(c.var.db, {
    actorId: actor.profileId,
    action: 'INVITATION_CANCELLED',
    resourceType: 'account_invitation',
    resourceId: id,
    requestId: c.var.requestId,
  });
  return c.json({ data: updated, requestId: c.var.requestId });
});

/** Role write. Removing the last ACTIVE ADMIN is rejected (spec §69). */
userRoutes.put('/:id/roles', manage, async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const { roles } = parse(roleInput, await c.req.json().catch(() => ({})));
  const db = c.var.db;
  await assertNotLastAdmin(db, id, roles.includes('ADMIN') ? 'allow' : 'deny');

  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.profileId, id));
    if (roles.length) await tx.insert(userRoles).values(roles.map((role) => ({ profileId: id, role })));
    await tx.update(profiles).set({ updatedAt: new Date() }).where(eq(profiles.id, id));
  });

  await writeAudit(db, {
    actorId: actor.profileId,
    action: 'USER_ROLE_ASSIGNED',
    resourceType: 'profile',
    resourceId: id,
    after: { roles },
    requestId: c.var.requestId,
  });
  return c.json({ data: { profileId: id, roles }, requestId: c.var.requestId });
});

for (const [action, status, audit] of [
  ['suspend', 'SUSPENDED', 'USER_SUSPENDED'],
  ['reactivate', 'ACTIVE', 'USER_REACTIVATED'],
  ['disable', 'DISABLED', 'USER_DISABLED'],
] as const) {
  userRoutes.post(`/:id/${action}`, manage, async (c) => {
    const actor = requireUser(c);
    const id = idParam(c);
    const db = c.var.db;
    if (status !== 'ACTIVE') await assertNotLastAdmin(db, id, 'deny');
    const [updated] = await db
      .update(profiles)
      .set({ status, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning({ id: profiles.id, status: profiles.status });
    if (!updated) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });
    await writeAudit(db, {
      actorId: actor.profileId,
      action: audit,
      resourceType: 'profile',
      resourceId: id,
      after: { status },
      requestId: c.var.requestId,
    });
    return c.json({ data: updated, requestId: c.var.requestId });
  });
}

/**
 * Lockout prevention. Returns a sentinel when the change is allowed, throws 409 LAST_ADMIN
 * when the target is the only remaining ACTIVE admin (spec §69).
 */
async function assertNotLastAdmin(db: AppEnv['Variables']['db'], profileId: string, keepAdmin: 'allow' | 'deny'): Promise<void> {
  const [target] = await db.select({ status: profiles.status }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!target) throw new HTTPException(404, { message: 'Pengguna tidak dijumpai.' });
  if (target.status !== 'ACTIVE' || keepAdmin === 'allow') return;

  const admins = await db
    .select({ profileId: userRoles.profileId })
    .from(userRoles)
    .innerJoin(profiles, eq(profiles.id, userRoles.profileId))
    .where(and(eq(userRoles.role, 'ADMIN'), eq(profiles.status, 'ACTIVE')));
  const isAdminTarget = admins.some((a) => a.profileId === profileId);
  const others = admins.filter((a) => a.profileId !== profileId);
  if (isAdminTarget && others.length === 0) {
    throw new HTTPException(409, {
      message: 'Ini satu-satunya pentadbir aktif. Lantik pentadbir lain terlebih dahulu.',
      cause: { code: 'LAST_ADMIN' },
    });
  }
}



