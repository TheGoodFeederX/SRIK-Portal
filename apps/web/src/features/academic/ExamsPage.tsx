import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

export type ExamRow = {
  id: string;
  academicYearId: string;
  yearName: string;
  name: string;
  term: string | null;
  examType: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED';
  startDate: string | null;
  endDate: string | null;
};
type Year = { id: string; name: string; isCurrent: boolean; status: string };

export const statusLabelKey: Record<ExamRow['status'], 'exam.status.DRAFT' | 'exam.status.REVIEW' | 'exam.status.APPROVED' | 'exam.status.PUBLISHED'> = {
  DRAFT: 'exam.status.DRAFT',
  REVIEW: 'exam.status.REVIEW',
  APPROVED: 'exam.status.APPROVED',
  PUBLISHED: 'exam.status.PUBLISHED',
};

export const statusStyle: Record<ExamRow['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  REVIEW: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-brand-100 text-brand-800',
  PUBLISHED: 'bg-emerald-100 text-emerald-900',
};

/** Exam list (spec v1.4 §36). */
export function ExamsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = user?.permissions.includes('exam.manage') ?? false;
  const [showForm, setShowForm] = useState(false);

  const exams = useQuery({ queryKey: ['exams'], queryFn: () => apiGet<{ data: ExamRow[] }>('/exams') });
  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<{ data: Year[] }>('/academic-years') });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<{ id: string }>('/exams', body),
    onSuccess: async () => {
      toast(t('exam.created'));
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('exam.title')}</h1>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('exam.add')}
          </button>
        )}
      </header>

      {showForm && canManage && (
        <form
          className="card grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            create.mutate({
              academicYearId: String(data.get('academicYearId')),
              name: String(data.get('name')),
              term: String(data.get('term') || '') || null,
              examType: String(data.get('examType') || 'SUMBER'),
              startDate: String(data.get('startDate') || '') || null,
              endDate: String(data.get('endDate') || '') || null,
            });
          }}
        >
          <div>
            <label className="label" htmlFor="x-year">{t('exam.year')}</label>
            <select id="x-year" name="academicYearId" className="input" required>
              {(years.data?.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="x-name">{t('exam.name')}</label>
            <input id="x-name" name="name" className="input" required maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="x-term">{t('exam.term')}</label>
            <input id="x-term" name="term" className="input" maxLength={30} />
          </div>
          <div>
            <label className="label" htmlFor="x-type">{t('exam.type')}</label>
            <select id="x-type" name="examType" className="input" defaultValue="SUMBER">
              <option value="SUMBER">Sumber</option>
              <option value="PERTENGAHAN">Pertengahan</option>
              <option value="AKHIR">Akhir</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="x-start">{t('exam.start')}</label>
              <input id="x-start" name="startDate" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="x-end">{t('exam.end')}</label>
              <input id="x-end" name="endDate" type="date" className="input" />
            </div>
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" disabled={create.isPending}>{t('app.save')}</button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</button>
          </div>
        </form>
      )}

      {exams.isLoading ? (
        <LoadingState rows={4} />
      ) : exams.isError ? (
        <ErrorState onRetry={() => exams.refetch()} />
      ) : (exams.data?.data.length ?? 0) === 0 ? (
        <EmptyState message={t('exam.empty')} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('exam.name')}</th>
                <th>{t('exam.year')}</th>
                <th>{t('common.status')}</th>
                <th>{t('exam.term')}</th>
                <th>{t('exam.date')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {exams.data!.data.map((x) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.name}</td>
                  <td className="text-xs">{x.yearName}</td>
                  <td>
                    <span className={`badge ${statusStyle[x.status]}`}>{t(statusLabelKey[x.status])}</span>
                  </td>
                  <td className="text-xs">{x.term ?? '—'}</td>
                  <td className="text-xs">{x.startDate ?? '—'}</td>
                  <td>
                    <Link to={`/app/academic/exams/${x.id}`} className="btn-ghost px-2 py-1 text-xs">
                      {t('exam.open')}
                    </Link>
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

export function failureMessage(
  e: Error,
  t: (k:
    | 'app.error.server'
    | 'app.error.forbidden'
    | 'exam.incomplete'
    | 'exam.immutable'
    | 'exam.notMutable'
    | 'exam.transitionInvalid'
    | 'exam.assignmentMissing'
    | 'exam.subjectExists'
    | 'exam.yearClosed'
    | 'exam.markOutOfRange') => string,
) {
  if (e instanceof ApiFailure) {
    switch (e.error.code) {
      case 'EXAM_MARKS_INCOMPLETE':
        return t('exam.incomplete');
      case 'EXAM_PUBLISHED_IMMUTABLE':
        return t('exam.immutable');
      case 'EXAM_NOT_MUTABLE':
        return t('exam.notMutable');
      case 'EXAM_TRANSITION_INVALID':
        return t('exam.transitionInvalid');
      case 'EXAM_ASSIGNMENT_MISSING':
        return t('exam.assignmentMissing');
      case 'EXAM_SUBJECT_EXISTS':
        return t('exam.subjectExists');
      case 'EXAM_YEAR_CLOSED':
        return t('exam.yearClosed');
      case 'EXAM_MARK_OUT_OF_RANGE':
        return t('exam.markOutOfRange');
      case 'FORBIDDEN':
        return t('app.error.forbidden');
      default:
        return e.error.message;
    }
  }
  return t('app.error.server');
}
