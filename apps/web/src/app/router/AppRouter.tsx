import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage, LoadingState } from '@/app/portfolios/DashboardPage';
import { PortfolioLandingPage } from '@/app/portfolios/PortfolioLandingPage';
import { StaffPage } from '@/features/administration/StaffPage';
import { AuditLogPage } from '@/features/administration/AuditLogPage';
import { StudentsPage } from '@/features/hem/StudentsPage';
import { AttendancePage } from '@/features/hem/AttendancePage';
import { ClassesPage } from '@/features/academic/ClassesPage';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';
import { NotFoundPage } from '@/components/layout/NotFoundPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  if (isLoading) return <div className="p-8">{t('app.loading')}</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="administration/staff" element={<StaffPage />} />
        <Route path="administration/audit-log" element={<AuditLogPage />} />
        <Route path="academic/classes" element={<ClassesPage />} />
        <Route path="hem/students" element={<StudentsPage />} />
        <Route path="hem/attendance" element={<AttendancePage />} />
        <Route path=":portfolio" element={<PortfolioLandingPage />} />
        <Route path="administration/*" element={<PlaceholderPage />} />
        <Route path="academic/*" element={<PlaceholderPage />} />
        <Route path="hem/*" element={<PlaceholderPage />} />
        <Route path="cocurricular/*" element={<PlaceholderPage />} />
        <Route path="*" element={<LoadingState rows={1} />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
