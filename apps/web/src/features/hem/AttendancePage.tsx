import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type ClassRow = { id: string; name: string; yearLevel: number; academicYearId: string; status: string };
type Year = { id: string; name: string; isCurrent: boolean; status: string };
type Student = { id: string; studentNo: string; fullName: string };
type AttendanceRow = { studentId: string; classId: string; status: string; reason: string | null };

const STATUSES = ['PRESENT', 'ABSENT', 'SICK', 'EXCUSED', 'LATE'] as const;
type Status = (typeof STATUSES)[number];

export function AttendancePage() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<Record<string, Status>>({});

  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<ClassRow[]>('/classes') });
  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<Year[]>('/academic-years') });
  const currentYear = years.data?.find((y) => y.isCurrent);
  const classOptions = useMemo(
    () => (classes.data ?? []).filter((c) => c.status === 'ACTIVE' && (!currentYear || c.academicYearId === currentYear.id)),
    [classes.data, currentYear],
  );

  const students = useQuery({
    queryKey: ['students', 'all'],
    queryFn: () => apiGet<{ data: Student[] }>('/students?limit=200'),
  });

  const existing = useQuery({
    queryKey: ['attendance', classId, date],
    queryFn: () => apiGet<AttendanceRow[]>(`/attendance/students?classId=${classId}&date=${date}`),
    enabled: Boolean(classId),
  });

  const save = useMutation({
    mutationFn: () =>
      apiPost('/attendance/students', {
        classId,
        attendanceDate: date,
        records: Object.entries(draft).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: async () => {
      toast(t('attendance.saved'));
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (e: Error) => toast(e instanceof ApiFailure ? e.error.message : t('app.error.server'), 'error'),
  });

  const rows = students.data?.data ?? [];
  const valueFor = (id: string): Status => draft[id] ?? (existing.data?.find((r) => r.studentId === id)?.status as Status) ?? 'PRESENT';

  if (classes.isLoading || students.isLoading) return <LoadingState rows={5} />;
  if (classes.isError || students.isError) return <ErrorState onRetry={() => { classes.refetch(); students.refetch(); }} />;
  if (classOptions.length === 0) return <EmptyState message={t('attendance.noclass')} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('attendance.title')}</h1>

      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="class">{t('attendance.class')}</label>
          <select id="class" className="input" value={classId} onChange={(e) => { setClassId(e.target.value); setDraft({}); }}>
            <option value="">—</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">{t('attendance.date')}</label>
          <input id="date" type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setDraft({}); }} />
        </div>
      </div>

      {!classId ? (
        <EmptyState message={t('app.empty')} />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <form
          className="card overflow-x-auto p-0"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>{t('student.no')}</th>
                <th>{t('student.name')}</th>
                <th>{t('student.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.studentNo}</td>
                  <td>{s.fullName}</td>
                  <td>
                    <fieldset className="flex flex-wrap gap-1" aria-label={`${s.fullName}`}>
                      {STATUSES.map((st) => (
                        <label
                          key={st}
                          className={
                            valueFor(s.id) === st
                              ? 'cursor-pointer rounded-md bg-brand-700 px-2 py-1 text-xs text-white'
                              : 'cursor-pointer rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700'
                          }
                        >
                          <input
                            type="radio"
                            name={`status-${s.id}`}
                            className="sr-only"
                            checked={valueFor(s.id) === st}
                            onChange={() => setDraft((d) => ({ ...d, [s.id]: st }))}
                          />
                          {t(`attendance.${st.toLowerCase()}` as 'attendance.present')}
                        </label>
                      ))}
                    </fieldset>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4">
            <button className="btn-primary" disabled={save.isPending}>{t('attendance.save')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
