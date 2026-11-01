import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';
import { failureMessage, statusLabelKey, statusStyle, type ExamRow } from './ExamsPage';

type ExamSubject = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  maxScore: string;
  passScore: string | null;
  teacherNames: string | null;
};
type ExamDetail = ExamRow & { subjects: ExamSubject[] };
type Completeness = {
  subjects: number;
  eligibleStudents: number;
  enteredMarks: number;
  missingMarks: number;
  completionPercentage: number;
  ready: boolean;
  perSubject: { examSubjectId: string; className: string; subjectCode: string; eligible: number; entered: number; missing: number }[];
};
type ClassRow = { id: string; name: string };
type Subject = { id: string; code: string; nameMs: string; isActive: boolean };

/** Exam detail: configuration, completeness and the workflow actions (spec v1.4 §37–§44). */
export function ExamDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmPublish, setConfirmPublish] = useState(false);

  const perms = user?.permissions ?? [];
  const can = {
    manage: perms.includes('exam.manage'),
    review: perms.includes('exam.marks.review'),
    approve: perms.includes('exam.marks.approve'),
    publish: perms.includes('exam.publish'),
    write: perms.includes('exam.marks.write'),
  };

  const exam = useQuery({ queryKey: ['exam', id], queryFn: () => apiGet<ExamDetail>(`/exams/${id}`) });
  const completeness = useQuery({ queryKey: ['exam-completeness', id], queryFn: () => apiGet<Completeness>(`/exams/${id}/completeness`) });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<{ data: ClassRow[] }>('/classes'), enabled: can.manage });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => apiGet<{ data: Subject[] }>('/subjects?active=true'), enabled: can.manage });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['exam', id] });
    await qc.invalidateQueries({ queryKey: ['exam-completeness', id] });
    await qc.invalidateQueries({ queryKey: ['exams'] });
  };

  const addSubject = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/exams/${id}/subjects`, body),
    onSuccess: async () => {
      toast(t('exam.subjectAdded'));
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const removeSubject = useMutation({
    mutationFn: (sid: string) => apiDelete(`/exam-subjects/${sid}`),
    onSuccess: async () => {
      toast(t('exam.subjectRemoved'));
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const transition = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: Record<string, unknown> }) => apiPost(`/exams/${id}/${action}`, body),
    onSuccess: async () => {
      toast(t('exam.transitionDone'));
      setConfirmPublish(false);
      await invalidate();
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  if (exam.isLoading) return <LoadingState rows={5} />;
  if (exam.isError) return <ErrorState onRetry={() => exam.refetch()} message={t('app.error.forbidden')} />;

  const data = exam.data!;
  const isDraft = data.status === 'DRAFT';
  const comp = completeness.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app/academic/exams" className="text-sm text-brand-700 hover:underline">← {t('exam.title')}</Link>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-slate-600">
            {data.yearName} · {data.term ?? data.examType}
          </p>
        </div>
        <span className={`badge ${statusStyle[data.status]}`}>{t(statusLabelKey[data.status])}</span>
      </header>

      {comp && (
        <section className="card space-y-2">
          <h2 className="text-base font-semibold">{t('exam.completeness')}</h2>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <p><span className="block text-xs text-slate-500">{t('exam.subjects')}</span>{comp.subjects}</p>
            <p><span className="block text-xs text-slate-500">{t('exam.eligible')}</span>{comp.eligibleStudents}</p>
            <p><span className="block text-xs text-slate-500">{t('exam.entered')}</span>{comp.enteredMarks}</p>
            <p><span className="block text-xs text-slate-500">{t('exam.missing')}</span>{comp.missingMarks}</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-brand-600" style={{ width: `${comp.completionPercentage}%` }} />
          </div>
          <p className="text-xs text-slate-600">{comp.completionPercentage}%</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t('exam.subjects')}</h2>

        {isDraft && can.manage && (
          <form
            className="card grid gap-3 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              addSubject.mutate({
                classId: String(f.get('classId')),
                subjectId: String(f.get('subjectId')),
                maxScore: Number(f.get('maxScore') || 100),
              });
            }}
          >
            <div className="sm:col-span-2">
              <label className="label" htmlFor="s-class">{t('timetable.class')}</label>
              <select id="s-class" name="classId" className="input" required>
                {(classes.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="s-subject">{t('assignments.subject')}</label>
              <select id="s-subject" name="subjectId" className="input" required>
                {(subjects.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.nameMs}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-max">{t('exam.maxScore')}</label>
              <input id="s-max" name="maxScore" type="number" min={1} max={1000} defaultValue={100} className="input" />
            </div>
            <div className="sm:col-span-5">
              <button className="btn-primary" disabled={addSubject.isPending}>{t('exam.addSubject')}</button>
            </div>
          </form>
        )}

        {(data.subjects.length ?? 0) === 0 ? (
          <EmptyState message={t('exam.noSubjects')} />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('timetable.class')}</th>
                  <th>{t('assignments.subject')}</th>
                  <th>{t('exam.maxScore')}</th>
                  <th>{t('exam.teachers')}</th>
                  <th>{t('exam.progress')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => {
                  const row = comp?.perSubject.find((p) => p.examSubjectId === s.id);
                  return (
                    <tr key={s.id}>
                      <td>{s.className}</td>
                      <td>
                        <span className="font-mono text-xs">{s.subjectCode}</span> {s.subjectName}
                      </td>
                      <td>{s.maxScore}</td>
                      <td className="text-xs">{s.teacherNames ?? '—'}</td>
                      <td className="text-xs">
                        {row ? `${row.entered}/${row.eligible}` : '—'}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {can.write && (
                            <Link to={`/app/academic/exams/${id}/marks/${s.id}`} className="btn-ghost px-2 py-1 text-xs">
                              {t('exam.enterMarks')}
                            </Link>
                          )}
                          {isDraft && can.manage && (
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => removeSubject.mutate(s.id)}>
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">{t('exam.workflow')}</h2>
        <div className="flex flex-wrap gap-2">
          {data.status === 'DRAFT' && can.review && (
            <button className="btn-primary" onClick={() => transition.mutate({ action: 'submit-review' })} disabled={!comp?.ready}>
              {t('exam.submitReview')}
            </button>
          )}
          {data.status === 'REVIEW' && can.review && (
            <button className="btn-ghost" onClick={() => transition.mutate({ action: 'return-draft' })}>
              {t('exam.returnDraft')}
            </button>
          )}
          {data.status === 'REVIEW' && can.approve && (
            <button className="btn-primary" onClick={() => transition.mutate({ action: 'approve' })}>
              {t('exam.approve')}
            </button>
          )}
          {data.status === 'APPROVED' && can.approve && (
            <button className="btn-ghost" onClick={() => transition.mutate({ action: 'return-review' })}>
              {t('exam.returnReview')}
            </button>
          )}
          {data.status === 'APPROVED' && can.publish && !confirmPublish && (
            <button className="btn-primary" onClick={() => setConfirmPublish(true)}>
              {t('exam.publish')}
            </button>
          )}
          {data.status === 'PUBLISHED' && <p className="text-sm text-slate-600">{t('exam.immutable')}</p>}
        </div>

        {confirmPublish && (
          <div role="alertdialog" aria-modal="true" className="rounded border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{t('exam.publishWarning')}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" onClick={() => transition.mutate({ action: 'publish' })}>
                {t('exam.publishConfirm')}
              </button>
              <button className="btn-ghost" onClick={() => setConfirmPublish(false)}>{t('app.cancel')}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
