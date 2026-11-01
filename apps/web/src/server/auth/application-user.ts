import { eq } from 'drizzle-orm';
import { profiles, userRoles, type Db } from '@srik/db';
import { permissionsForRoles, type Role } from '@srik/shared';
import type { AccessDenial, ApplicationUser, AuthIdentity } from '../types.ts';

type LookupResult =
  | { kind: 'ok'; user: ApplicationUser }
  | { kind: 'denied'; denial: AccessDenial };

/**
 * Authenticated identity → application user (spec §6, §19, §50–52, §61).
 * Never creates a profile: an unlinked identity simply has no application access.
 */
export async function resolveApplicationUser(db: Db, identity: AuthIdentity): Promise<LookupResult> {
  const [profile] = await db
    .select({
      id: profiles.id,
      authUserId: profiles.authUserId,
      email: profiles.email,
      displayName: profiles.displayName,
      status: profiles.status,
      mustChangePassword: profiles.mustChangePassword,
    })
    .from(profiles)
    .where(eq(profiles.authUserId, identity.authUserId))
    .limit(1);

  if (!profile) {
    return {
      kind: 'denied',
      denial: {
        state: 'authenticated-unlinked',
        code: 'APP_PROFILE_NOT_LINKED',
        message: 'Akaun ini belum diaktifkan untuk Portal SRIK.',
      },
    };
  }

  if (profile.status === 'INVITED') {
    return {
      kind: 'denied',
      denial: {
        state: 'authenticated-invited',
        code: 'APP_ACCOUNT_INVITED',
        message: 'Akaun ini masih menunggu pengaktifan.',
      },
    };
  }
  if (profile.status === 'SUSPENDED') {
    return {
      kind: 'denied',
      denial: {
        state: 'authenticated-suspended',
        code: 'APP_ACCOUNT_SUSPENDED',
        message: 'Akaun anda telah digantung. Sila hubungi pentadbir sekolah.',
      },
    };
  }
  if (profile.status === 'DISABLED') {
    return {
      kind: 'denied',
      denial: {
        state: 'authenticated-disabled',
        code: 'APP_ACCOUNT_DISABLED',
        message: 'Akaun anda telah dinyahaktifkan. Sila hubungi pentadbir sekolah.',
      },
    };
  }

  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.profileId, profile.id))).map(
    (r) => r.role as Role,
  );
  if (roles.length === 0) {
    return {
      kind: 'denied',
      denial: {
        state: 'authenticated-roleless',
        code: 'APP_ROLE_NOT_ASSIGNED',
        message: 'Akaun ini belum diberikan peranan.',
      },
    };
  }

  return {
    kind: 'ok',
    user: {
      profileId: profile.id,
      authUserId: identity.authUserId,
      email: profile.email,
      displayName: profile.displayName,
      roles,
      permissions: permissionsForRoles(roles),
      mustChangePassword: profile.mustChangePassword,
    },
  };
}
