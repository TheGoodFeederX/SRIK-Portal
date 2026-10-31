import type { Db } from '@srik/db';
import type { AuthCode, AppAuthState, Permission, Role } from '@srik/shared';

/** Verified Managed Better Auth identity (neon_auth.user). */
export type AuthIdentity = {
  authUserId: string;
  email: string;
  emailVerified: boolean;
};

/** Application identity + authorization derived from `profiles` and `user_roles`. */
export type ApplicationUser = {
  profileId: string;
  authUserId: string;
  email: string;
  displayName: string;
  roles: Role[];
  permissions: Permission[];
};

/** Why an authenticated identity may not use the app (spec §50–52). */
export type AccessDenial = { state: AppAuthState; code: AuthCode; message: string };

export type AppEnv = {
  Variables: {
    db: Db;
    requestId: string;
    identity: AuthIdentity | null;
    denial: AccessDenial | null;
    user: ApplicationUser | null;
  };
};
