import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type Assignment = {
  id: string;
  academicYearId: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  isPrimary: boolean;
  teacherName: string;
  className: string;
  subjectCode: string;
  subjectName: string;
};
type Year = { id: string; name: string; isCurrent: boolean; status: string };
type ClassRow = { id: string; name: string; academicYearId: string };
type Subject = { id: string; code: string; nameMs: string; isActive: boolean };
type Staff = { id: string; fullName: string; employmentStatus: string };
type List<T> = { data: T[] };

/** Teaching assignments: teacher + class + subject + year (spec v1.2 §10–§12). */
export function AssignmentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const canManage = user?.permissions.includes('academic.assignment.manage') ?? false;

  const assignments = useQuery({ queryKey: ['assignments'], queryFn: () => apiGet<List<Assignment>>('/teaching-assignments') });
  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<List<Year>>('/academic-years') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<List<ClassRow>>('/classes') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => apiGet<List<Subject>>('/subjects') });
  const staff = useQuery({ queryKey: ['staff', 'ref'], queryFn: () => apiGet<{ data: Staff[] }>('/staff?limit=200') });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost('/teaching-assignments', body),
    onSuccess: async () => {
      toast(t('assignments.created'));
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/teaching-assignments/${id}`),
    onSuccess: async () => {
      toast(t('assignments.removed'));
      await qc.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const activeSubjects = (subjects.data?.data ?? []).filter((s) => s.isActive);
  const activeStaff = (staff.data?.data ?? []).filter((s) => s.employmentStatus === 'ACTIVE');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('assignments.title')}</h1>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('assignments.add')}
          </button>
        )}
      </header>

      {showForm && canManage && (
        <form
          className="card grid gap-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            create.mutate({
              academicYearId: String(data.get('academicYearId')),
              teacherId: String(data.get('teacherId')),
              classId: String(data.get('classId')),
              subjectId: String(data.get('subjectId')),
              isPrimary: data.get('isPrimary') === 'on',
            });
          }}
        >
          <div>
            <label className="label" htmlFor="a-year">{t('assignments.year')}</label>
            <select id="a-year" name="academicYearId" className="input" required>
              {(years.data?.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-teacher">{t('assignments.teacher')}</label>
            <select id="a-teacher" name="teacherId" className="input" required>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-class">{t('assignments.class')}</label>
            <select id="a-class" name="classId" className="input" required>
              {(classes.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-subject">{t('assignments.subject')}</label>
            <select id="a-subject" name="subjectId" className="input" required>
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.nameMs}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" name="isPrimary" />
            {t('assignments.primary')}
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button className="btn-primary" disabled={create.isPending}>{t('app.save')}</button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</button>
          </div>
        </form>
      )}

      {assignments.isLoading ? (
        <LoadingState rows={5} />
      ) : assignments.isError ? (
        <ErrorState onRetry={() => assignments.refetch()} />
      ) : (assignments.data?.data.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('assignments.teacher')}</th>
                <th>{t('assignments.class')}</th>
                <th>{t('assignments.subject')}</th>
                <th>{t('assignments.primary')}</th>
                {canManage && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {assignments.data!.data.map((a) => (
                <tr key={a.id}>
                  <td>{a.teacherName}</td>
                  <td>{a.className}</td>
                  <td>
                    <span className="font-mono text-xs">{a.subjectCode}</span> {a.subjectName}
                  </td>
                  <td>{a.isPrimary ? t('common.yes') : '—'}</td>
                  {canManage && (
                    <td>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        aria-label={t('assignments.remove')}
                        onClick={() => remove.mutate(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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

function failureMessage(e: Error, t: (k: 'app.error.server' | 'app.error.forbidden' | 'assignments.exists' | 'assignments.invalid' | 'years.closed') => string) {
  if (e instanceof ApiFailure) {
    switch (e.error.code) {
      case 'ASSIGNMENT_EXISTS':
        return t('assignments.exists');
      case 'INVALID_CLASS':
      case 'INVALID_TEACHER':
      case 'INVALID_SUBJECT':
      case 'SUBJECT_INACTIVE':
        return t('assignments.invalid');
      case 'ACADEMIC_YEAR_CLOSED':
        return t('years.closed');
      case 'FORBIDDEN':
        return t('app.error.forbidden');
      default:
        return e.error.message;
    }
  }
  return t('app.error.server');
}
