/** Stable application error/state codes (spec v1.1 §93). Frontend maps each to a BM message. */
export const AUTH_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  APP_PROFILE_NOT_LINKED: 'APP_PROFILE_NOT_LINKED',
  APP_ACCOUNT_INVITED: 'APP_ACCOUNT_INVITED',
  APP_ACCOUNT_SUSPENDED: 'APP_ACCOUNT_SUSPENDED',
  APP_ACCOUNT_DISABLED: 'APP_ACCOUNT_DISABLED',
  APP_ROLE_NOT_ASSIGNED: 'APP_ROLE_NOT_ASSIGNED',
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_CANCELLED: 'INVITATION_CANCELLED',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  AUTH_ALREADY_LINKED: 'AUTH_ALREADY_LINKED',
  LAST_ADMIN: 'LAST_ADMIN',
} as const;

export type AuthCode = keyof typeof AUTH_CODES;

/** Application access states surfaced by GET /auth/session. */
export type AppAuthState =
  | 'authenticated-active'
  | 'authenticated-unlinked'
  | 'authenticated-invited'
  | 'authenticated-suspended'
  | 'authenticated-disabled'
  | 'authenticated-roleless';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
