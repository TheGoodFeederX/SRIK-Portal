import { and, count, eq } from 'drizzle-orm';
import { profiles, userRoles, type Db } from '@srik/db';

/** Invitation lifetime (spec §64). One constant, never duplicated in the frontend. */
export const INVITATION_TTL_HOURS = 72;

export const invitationExpiry = (now = new Date()) => new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000);

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

/** Number of ACTIVE profiles holding the ADMIN role. */
export async function activeAdminCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(userRoles)
    .innerJoin(profiles, eq(profiles.id, userRoles.profileId))
    .where(and(eq(userRoles.role, 'ADMIN'), eq(profiles.status, 'ACTIVE')));
  return Number(row?.total ?? 0);
}
