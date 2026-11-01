import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { useAuth } from '@/app/providers/auth';
import { PORTFOLIOS, availableFor } from '@/app/navigation/portfolioRegistry';
import { Link } from 'react-router-dom';
import type { TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';

type Summary = { students: number; staff: number; classes: number; academicYears: number; attendanceRecordedToday: number };

export function DashboardPage() {
  const { t } = useI18n();
  const { user: session } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['meta', 'summary'], queryFn: () => apiGet<Summary>('/meta/summary') });

  const cards: { key: TranslationKey; value: number | undefined }[] = [
    { key: 'dashboard.students', value: data?.students },
    { key: 'dashboard.staff', value: data?.staff },
    { key: 'dashboard.classes', value: data?.classes },
    { key: 'dashboard.years', value: data?.academicYears },
    { key: 'dashboard.attendanceToday', value: data?.attendanceRecordedToday },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
        <p className="text-sm text-slate-600">{session?.displayName}</p>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => (
            <div key={c.key} className="card">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t(c.key)}</p>
              <p className="mt-2 text-3xl font-semibold text-brand-700">
                {isLoading ? '—' : (c.value ?? 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('app.menu')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PORTFOLIOS.map((p) => {
            const usable = availableFor(session, p.id);
            return (
              <Link key={p.id} to={p.path} className="card transition hover:border-brand-500">
                <h3 className="text-base font-semibold text-brand-900">{t(p.titleKey)}</h3>
                <p className="mt-1 text-sm text-slate-600">{t(p.descriptionKey)}</p>
                <p className="mt-3 text-xs text-slate-500">
                  {usable.length > 0 ? `${usable.length} ${t('readiness.available')}` : t('readiness.placeholder')}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div className="card border-red-200 bg-red-50" role="alert">
      <p className="text-sm text-red-800">{message ?? t('app.error.server')}</p>
      {onRetry && (
        <button className="btn-ghost mt-3" onClick={onRetry}>
          {t('app.retry')}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">{t('app.loading')}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('h-10 animate-pulse rounded-lg bg-slate-100')} />
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useI18n();
  return <div className="card text-center text-sm text-slate-500">{message ?? t('app.empty')}</div>;
}
