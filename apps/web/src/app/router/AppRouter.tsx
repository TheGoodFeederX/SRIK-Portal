import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth, isOperational } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { AccountStatePage } from '@/features/auth/AccountStatePage';
import { DashboardPage, LoadingState } from '@/app/portfolios/DashboardPage';
import { PortfolioLandingPage } from '@/app/portfolios/PortfolioLandingPage';
import { StaffPage } from '@/features/administration/StaffPage';
import { AuditLogPage } from '@/features/administration/AuditLogPage';
import { UsersPage } from '@/features/administration/UsersPage';
import { StudentsPage } from '@/features/hem/StudentsPage';
import { AttendancePage } from '@/features/hem/AttendancePage';
import { ClassesPage } from '@/features/academic/ClassesPage';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';
import { NotFoundPage } from '@/components/layout/NotFoundPage';

/**
 * Route guard (spec §57): loading → spinner, signed-out → /login,
 * any non-active authenticated state → explicit account-state screen,
 * only `authenticated-active` enters the operational shell.
 */
function RequireActive({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  if (state === 'loading') return <div className="p-8">{t('app.loading')}</div>;
  if (state === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isOperational(state)) return <AccountStatePage />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/lupa-kata-laluan" element={<ForgotPasswordPage />} />
      <Route path="/reset-kata-laluan" element={<ResetPasswordPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/app"
        element={
          <RequireActive>
            <AppShell />
          </RequireActive>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="administration/staff" element={<StaffPage />} />
        <Route path="administration/users" element={<UsersPage />} />
        <Route path="administration/audit-log" element={<AuditLogPage />} />
        <Route path="academic/classes" element={<ClassesPage />} />
        <Route path="hem/students" element={<StudentsPage />} />
        <Route path="hem/attendance" element={<AttendancePage />} />
        <Route path=":portfolio" element={<PortfolioLandingPage />} />
        <Route path="administration/*" element={<PlaceholderPage />} />
        <Route path="academic/*" element={<PlaceholderPage />} />
        <Route path="hem/*" element={<PlaceholderPage />} />
        <Route path="cocurricular/*" element={<PlaceholderPage />} />
        {/* Unknown routes render the shell 404, not an endless skeleton (spec §58). */}
        <Route path="*" element={<NotFoundPage inShell />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export { LoadingState };
