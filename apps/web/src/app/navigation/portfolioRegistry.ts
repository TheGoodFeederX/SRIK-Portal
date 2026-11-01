import type { Permission, Role } from '@srik/shared';
import type { TranslationKey } from '@/i18n';

export type PortfolioId = 'administration' | 'academic' | 'hem' | 'cocurricular';
export type Readiness = 'available' | 'placeholder' | 'deferred' | 'legacy-hold';
export type Audience = Role | 'PARENT' | 'STUDENT';

export interface ModuleNavigationEntry {
  id: string;
  portfolio: PortfolioId;
  group: TranslationKey;
  titleKey: TranslationKey;
  path: string;
  audiences: Audience[];
  requiredPermissions?: Permission[];
  readiness: Readiness;
  order: number;
  aliases?: string[];
}

export const PORTFOLIOS: { id: PortfolioId; titleKey: TranslationKey; descriptionKey: TranslationKey; path: string }[] = [
  { id: 'administration', titleKey: 'portfolio.administration.title', descriptionKey: 'portfolio.administration.description', path: '/app/administration' },
  { id: 'academic', titleKey: 'portfolio.academic.title', descriptionKey: 'portfolio.academic.description', path: '/app/academic' },
  { id: 'hem', titleKey: 'portfolio.hem.title', descriptionKey: 'portfolio.hem.description', path: '/app/hem' },
  { id: 'cocurricular', titleKey: 'portfolio.cocurricular.title', descriptionKey: 'portfolio.cocurricular.description', path: '/app/cocurricular' },
];

/**
 * Frontend registry = navigation/UX only. It is NOT authorization:
 * the API re-checks permissions and record scope on every request.
 * ponytail: no eager screens here; routes are lazy in the router.
 */
export const registry: ModuleNavigationEntry[] = [
  // Pentadbiran
  { id: 'admin.staff', portfolio: 'administration', group: 'group.staff', titleKey: 'staff.title', path: '/app/administration/staff', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['staff.read'], readiness: 'available', order: 10 },
  { id: 'admin.staff-attendance', portfolio: 'administration', group: 'group.staff', titleKey: 'attendance.title', path: '/app/administration/staff-attendance', audiences: ['ADMIN'], requiredPermissions: ['staff.read'], readiness: 'deferred', order: 20 },
  { id: 'admin.finance', portfolio: 'administration', group: 'group.finance', titleKey: 'portfolio.administration.title', path: '/app/administration/finance', audiences: ['ADMIN'], readiness: 'deferred', order: 30 },
  { id: 'admin.audit', portfolio: 'administration', group: 'group.system', titleKey: 'audit.title', path: '/app/administration/audit-log', audiences: ['ADMIN'], requiredPermissions: ['system.audit.read'], readiness: 'available', order: 40 },
  { id: 'admin.users', portfolio: 'administration', group: 'group.system', titleKey: 'users.title', path: '/app/administration/users', audiences: ['ADMIN'], requiredPermissions: ['system.user.manage'], readiness: 'available', order: 50 },

  // Akademik
  { id: 'academic.classes', portfolio: 'academic', group: 'group.academic', titleKey: 'classes.title', path: '/app/academic/classes', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['academic.class.read'], readiness: 'available', order: 10 },
  { id: 'academic.subjects', portfolio: 'academic', group: 'group.academic', titleKey: 'subjects.title', path: '/app/academic/subjects', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['academic.subject.read'], readiness: 'available', order: 20 },
  { id: 'academic.assignments', portfolio: 'academic', group: 'group.academic', titleKey: 'assignments.title', path: '/app/academic/teaching-assignments', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['academic.assignment.read'], readiness: 'available', order: 25 },
  { id: 'academic.enrollments', portfolio: 'academic', group: 'group.academic', titleKey: 'enrollments.title', path: '/app/academic/enrollments', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['student.read'], readiness: 'available', order: 28 },
  { id: 'academic.timetable', portfolio: 'academic', group: 'group.academic', titleKey: 'portfolio.academic.title', path: '/app/academic/timetable', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['timetable.read'], readiness: 'placeholder', order: 30 },
  { id: 'academic.exams', portfolio: 'academic', group: 'group.academic', titleKey: 'portfolio.academic.title', path: '/app/academic/exams', audiences: ['ADMIN', 'TEACHER'], readiness: 'placeholder', order: 40 },

  // HEM
  { id: 'hem.students', portfolio: 'hem', group: 'group.students', titleKey: 'student.title', path: '/app/hem/students', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['student.read'], readiness: 'available', order: 10 },
  { id: 'hem.attendance', portfolio: 'hem', group: 'group.students', titleKey: 'attendance.title', path: '/app/hem/attendance', audiences: ['ADMIN', 'TEACHER'], requiredPermissions: ['attendance.student.read'], readiness: 'available', order: 20 },
  { id: 'hem.discipline', portfolio: 'hem', group: 'group.students', titleKey: 'portfolio.hem.title', path: '/app/hem/discipline', audiences: ['ADMIN', 'TEACHER'], readiness: 'deferred', order: 30 },
  { id: 'hem.welfare', portfolio: 'hem', group: 'group.students', titleKey: 'portfolio.hem.title', path: '/app/hem/welfare', audiences: ['ADMIN'], readiness: 'deferred', order: 40 },

  // Kokurikulum — portfolio exists, modules start as honest placeholders.
  { id: 'coc.unit', portfolio: 'cocurricular', group: 'group.units', titleKey: 'portfolio.cocurricular.title', path: '/app/cocurricular/units', audiences: ['ADMIN', 'TEACHER'], readiness: 'placeholder', order: 10 },
  { id: 'coc.house', portfolio: 'cocurricular', group: 'group.units', titleKey: 'portfolio.cocurricular.title', path: '/app/cocurricular/houses', audiences: ['ADMIN', 'TEACHER'], readiness: 'placeholder', order: 20 },
  { id: 'coc.activity', portfolio: 'cocurricular', group: 'group.units', titleKey: 'portfolio.cocurricular.title', path: '/app/cocurricular/activities', audiences: ['ADMIN', 'TEACHER'], readiness: 'placeholder', order: 30 },
  { id: 'coc.achievement', portfolio: 'cocurricular', group: 'group.units', titleKey: 'portfolio.cocurricular.title', path: '/app/cocurricular/achievements', audiences: ['ADMIN', 'TEACHER'], readiness: 'placeholder', order: 40 },
];

/** Legacy route redirects (replace, no history loop). Empty until migration inventory is approved. */
export const legacyRedirects: { from: string; to: string }[] = [];

/** Sidebar/footer list for one portfolio: available only, and only what this user may open. */
export function availableFor(user: { roles: string[]; permissions: string[] } | null, portfolio: PortfolioId): ModuleNavigationEntry[] {
  if (!user) return [];
  return registry
    .filter((e) => e.portfolio === portfolio && e.readiness === 'available' && canOpen(user, e))
    .sort((a, b) => a.order - b.order);
}

export function canOpen(user: { roles: string[]; permissions: string[] } | null, entry: ModuleNavigationEntry): boolean {
  if (!user) return false;
  if (!entry.audiences.some((a) => user.roles.includes(a))) return false;
  return !entry.requiredPermissions || entry.requiredPermissions.every((p) => user.permissions.includes(p));
}
