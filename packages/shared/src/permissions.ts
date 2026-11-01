export type Role = 'ADMIN' | 'TEACHER';

/**
 * Permission strings live here only. Single source of truth for API + UI.
 * Format: <domain>.<resource>.<action>
 *
 * Owned permissions are implemented today. RESERVED_PERMISSIONS are declared for later
 * phases and are granted to nobody yet (spec v1.1 §33).
 */
export const PERMISSIONS = [
  'staff.read',
  'staff.write',
  'student.read',
  'student.write',
  'attendance.student.take',
  'attendance.student.read',
  'academic.year.read',
  'academic.year.manage',
  'academic.class.read',
  'academic.class.manage',
  'academic.subject.read',
  'academic.subject.manage',
  'academic.assignment.read',
  'academic.assignment.manage',
  'timetable.read',
  'system.user.manage',
  'system.audit.read',
] as const;

export const RESERVED_PERMISSIONS = [
  'timetable.manage',
  'exam.read',
  'exam.manage',
  'exam.marks.write',
  'exam.marks.review',
  'exam.marks.approve',
  'exam.publish',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type ReservedPermission = (typeof RESERVED_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  // TEACHER write permissions are further limited by record scope (own classes/subjects).
  TEACHER: [
    'staff.read',
    'student.read',
    'attendance.student.take',
    'attendance.student.read',
    'academic.year.read',
    'academic.class.read',
    'academic.subject.read',
    'academic.assignment.read',
    'timetable.read',
  ],
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
