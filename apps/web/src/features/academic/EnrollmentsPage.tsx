import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type Year = { id: string; name: string; isCurrent: boolean; status: string };
type ClassRow = { id: string; name: string; academicYearId: string };
type Enrollment = {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  classId: string;
  className: string;
  academicYearId: string;
  enrolledAt: string;
  status: 'ACTIVE' | 'TRANSFERRED' | 'WITHDRAWN' | 'COMPLETED';
};
type Student = { id: string; studentNo: string; fullName: string };
type List<T> = { data: T[] };

/**
 * Class-centric enrollment management (spec v1.2 §15–§17, §35–§36).
 * Enrollment is the authoritative student↔class membership for an academic year.
 */
export function EnrollmentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const canManage = user?.permissions.includes('academic.class.manage') ?? false;
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [moving, setMoving] = useState<{ id: string; currentClass: string } | null>(null);

  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<List<Year>>('/academic-years') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<List<ClassRow>>('/classes') });
  const students = useQuery({ queryKey: ['students', 'all'], queryFn: () => apiGet<{ data: Student[] }>('/students?limit=200'), enabled: canManage });

  const effectiveYear = yearId || years.data?.data.find((y) => y.isCurrent)?.id || '';
  const classOptions = useMemo(
    () => (classes.data?.data ?? []).filter((c) => !effectiveYear || c.academicYearId === effectiveYear),
    [classes.data, effectiveYear],
  );
  const effectiveClass = classId || classOptions[0]?.id || '';

  const roster = useQuery({
    queryKey: ['enrollments', effectiveClass],
    queryFn: () => apiGet<List<Enrollment>>(`/enrollments?classId=${effectiveClass}`),
    enabled: Boolean(effectiveClass),
  });

  const enrolledIds = new Set((roster.data?.data ?? []).map((r) => r.studentId));
  const unassigned = (students.data?.data ?? []).filter((s) => !enrolledIds.has(s.id));

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['enrollments'] });
    await qc.invalidateQueries({ queryKey: ['students'] });
    await qc.invalidateQueries({ queryKey: ['academic-summary'] });
  };

  const bulk = useMutation({
    mutationFn: () => apiPost('/enrollments/bulk', { classId: effectiveClass, academicYearId: effectiveYear, studentIds: picked }),
    onSuccess: async () => {
      toast(t('enrollments.added'));
      setPicked([]);
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const move = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => apiPatch(`/enrollments/${id}/class`, { classId: to }),
    onSuccess: async () => {
      toast(t('enrollments.moved'));
      setMoving(null);
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const end = useMutation({
    mutationFn: (id: string) => apiPost(`/enrollments/${id}/end`, { status: 'COMPLETED' }),
    onSuccess: async () => {
      toast(t('enrollments.ended'));
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('enrollments.title')}</h1>

      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="e-year">{t('enrollments.year')}</label>
          <select id="e-year" className="input" value={effectiveYear} onChange={(e) => { setYearId(e.target.value); setClassId(''); }}>
            {(years.data?.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ` (${t('common.current')})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-class">{t('enrollments.class')}</label>
          <select id="e-class" className="input" value={effectiveClass} onChange={(e) => setClassId(e.target.value)}>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-slate-600">
          <strong>{roster.data?.data.length ?? 0}</strong> {t('enrollments.members')}
        </p>
      </div>

      {canManage && unassigned.length > 0 && (
        <form
          className="card space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked.length) bulk.mutate();
          }}
        >
          <h2 className="text-base font-semibold">{t('enrollments.addTitle')}</h2>
          <div className="max-h-48 overflow-y-auto rounded border border-slate-200 p-2">
            {unassigned.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={(e) =>
                    setPicked((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                  }
                />
                <span className="font-mono text-xs text-slate-500">{s.studentNo}</span>
                {s.fullName}
              </label>
            ))}
          </div>
          <button className="btn-primary" disabled={bulk.isPending || picked.length === 0}>
            <UserPlus className="h-4 w-4" />
            {t('enrollments.add')} ({picked.length})
          </button>
        </form>
      )}

      {roster.isLoading ? (
        <LoadingState rows={5} />
      ) : roster.isError ? (
        <ErrorState onRetry={() => roster.refetch()} />
      ) : (roster.data?.data.length ?? 0) === 0 ? (
        <EmptyState message={t('enrollments.empty')} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('enrollments.studentNo')}</th>
                <th>{t('enrollments.student')}</th>
                <th>{t('common.status')}</th>
                {canManage && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {roster.data!.data.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.studentNo}</td>
                  <td>{r.studentName}</td>
                  <td>
                    <span className={r.status === 'ACTIVE' ? 'badge bg-brand-100 text-brand-800' : 'badge bg-slate-100 text-slate-600'}>
                      {r.status}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {moving?.id === r.id ? (
                          <>
                            <select
                              aria-label={t('enrollments.moveTo')}
                              className="input w-auto text-xs"
                              defaultValue=""
                              onChange={(e) => e.target.value && move.mutate({ id: r.id, to: e.target.value })}
                            >
                              <option value="">{t('enrollments.moveTo')}</option>
                              {classOptions
                                .filter((c) => c.id !== r.classId)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMoving(null)}>{t('app.cancel')}</button>
                          </>
                        ) : (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMoving({ id: r.id, currentClass: r.classId })}>
                            {t('enrollments.move')}
                          </button>
                        )}
                        {r.status === 'ACTIVE' && (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => end.mutate(r.id)}>
                            {t('enrollments.end')}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function failureMessage(e: Error, t: (k: 'app.error.server' | 'app.error.forbidden' | 'enrollments.exists' | 'years.closed') => string) {
  if (e instanceof ApiFailure) {
    if (e.error.code === 'ENROLLMENT_EXISTS') return t('enrollments.exists');
    if (e.error.code === 'ACADEMIC_YEAR_CLOSED') return t('years.closed');
    if (e.status === 403) return t('app.error.forbidden');
    return e.error.message;
  }
  return t('app.error.server');
}
