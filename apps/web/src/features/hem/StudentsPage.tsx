import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

export type Student = {
  id: string;
  studentNo: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  enrollmentDate: string;
  status: 'ACTIVE' | 'GRADUATED' | 'TRANSFERRED' | 'WITHDRAWN';
};

type List<T> = { data: T[]; meta: { total: number } };

export function StudentsPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['students'], queryFn: () => apiGet<List<Student>>('/students?limit=100') });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('student.title')}</h1>
      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (query.data?.data.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('student.no')}</th>
                <th>{t('student.name')}</th>
                <th>{t('student.gender')}</th>
                <th>{t('student.dob')}</th>
                <th>{t('student.enrolled')}</th>
                <th>{t('student.status')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data!.data.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.studentNo}</td>
                  <td>{s.fullName}</td>
                  <td>{t(`gender.${s.gender}` as 'gender.MALE')}</td>
                  <td>{s.dateOfBirth}</td>
                  <td>{s.enrollmentDate}</td>
                  <td>
                    <span className="badge bg-brand-100 text-brand-800">{t(`status.${s.status}` as 'status.ACTIVE')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
