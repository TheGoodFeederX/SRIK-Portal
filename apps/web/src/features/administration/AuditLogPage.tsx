import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type Entry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  createdAt: string;
};

export function AuditLogPage() {
  const { t } = useI18n();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => apiGet<Entry[]>('/audit-log'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState
          onRetry={() => refetch()}
          message={(error as { status?: number }).status === 403 ? t('app.error.forbidden') : undefined}
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('audit.time')}</th>
                <th>{t('audit.action')}</th>
                <th>{t('audit.resource')}</th>
                <th>{t('audit.actor')}</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-xs">{new Date(e.createdAt).toLocaleString('ms-MY')}</td>
                  <td className="font-mono text-xs">{e.action}</td>
                  <td className="font-mono text-xs">{e.resourceType}</td>
                  <td className="font-mono text-xs">{e.actorId?.slice(0, 8) ?? 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
