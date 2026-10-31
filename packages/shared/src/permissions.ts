export type Role = 'ADMIN' | 'TEACHER';

/**
 * Permission strings live here only. Single source of truth for API + UI.
 * Format: <domain>.<resource>.<action>
 */
export const PERMISSIONS = [
  'staff.read',
  'staff.write',
  'student.read',
  'student.write',
  'attendance.student.take',
  'attendance.student.read',
  'academic.year.manage',
  'academic.class.manage',
  'academic.subject.manage',
  'academic.assignment.manage',
  'system.user.manage',
  'system.audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  // TEACHER write permissions are further limited by record scope (own classes/subjects).
  TEACHER: ['staff.read', 'student.read', 'attendance.student.take', 'attendance.student.read'],
};

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

/** Pure permission check. Scope checks happen in the API on top of this. */
export function can(user: { roles: readonly Role[] } | null, permission: Permission): boolean {
  if (!user) return false;
  return user.roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}
