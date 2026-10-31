import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type ClassRow = { id: string; name: string; yearLevel: number; academicYearId: string; classTeacherId: string | null };
type Year = { id: string; name: string; isCurrent: boolean };
type Staff = { id: string; fullName: string };

export function ClassesPage() {
  const { t } = useI18n();
  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<Year[]>('/academic-years') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<ClassRow[]>('/classes') });
  const staff = useQuery({ queryKey: ['staff', 'ref'], queryFn: () => apiGet<{ data: Staff[] }>('/staff?limit=200') });

  if (years.isLoading || classes.isLoading) return <LoadingState rows={4} />;
  if (years.isError || classes.isError) return <ErrorState onRetry={() => { years.refetch(); classes.refetch(); }} />;

  const yearName = (id: string) => years.data?.find((y) => y.id === id)?.name ?? '—';
  const teacherName = (id: string | null) => staff.data?.data.find((s) => s.id === id)?.fullName ?? '—';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('classes.title')}</h1>
      {(classes.data?.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('classes.name')}</th>
                <th>{t('classes.level')}</th>
                <th>{t('classes.year')}</th>
                <th>{t('classes.teacher')}</th>
              </tr>
            </thead>
            <tbody>
              {classes.data!.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.yearLevel}</td>
                  <td>{yearName(c.academicYearId)}</td>
                  <td>{teacherName(c.classTeacherId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
