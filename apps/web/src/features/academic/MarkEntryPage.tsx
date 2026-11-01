import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut, ApiFailure } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

type MarkRow = { studentId: string; studentNo: string; fullName: string; score: string | null; grade: string | null; remarks: string | null };
type MarksMeta = { examSubjectId: string; examId: string; maxScore: string; passScore: string | null; status: string; eligible: number; entered: number };

/** Teacher mark entry (spec v1.4 §40–§41): roster from active enrollment, explicit bulk save. */
export function MarkEntryPage() {
  const { id = '', examSubjectId = '' } = useParams();
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const marks = useQuery({
    queryKey: ['exam-marks', examSubjectId],
    queryFn: () => apiGet<MarkRow[]>(`/exam-subjects/${examSubjectId}/marks`),
  });

  // Seed the editable draft from the server rows once they load.
  useEffect(() => {
    if (!marks.data) return;
    const next: Record<string, string> = {};
    for (const row of marks.data) next[row.studentId] = row.score ?? '';
    setDraft(next);
  }, [marks.data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut(`/exam-subjects/${examSubjectId}/marks`, {
        rows: Object.entries(draft).map(([studentId, value]) => ({
          studentId,
          score: value.trim() === '' ? null : Number(value),
        })),
      }),
    onSuccess: async () => {
      toast(t('exam.marksSaved'));
      await qc.invalidateQueries({ queryKey: ['exam-marks', examSubjectId] });
      await qc.invalidateQueries({ queryKey: ['exam-completeness', id] });
    },
    onError: (e: Error) => {
      const message = e instanceof ApiFailure ? e.error.message : t('app.error.server');
      toast(message, 'error');
    },
  });

  if (marks.isLoading) return <LoadingState rows={6} />;
  if (marks.isError) return <ErrorState onRetry={() => marks.refetch()} message={t('app.error.forbidden')} />;
  if ((marks.data?.length ?? 0) === 0) return <EmptyState message={t('exam.noStudents')} />;

  const maxScore = 100;
  const editable = true;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/app/academic/exams/${id}`} className="text-sm text-brand-700 hover:underline">← {t('exam.detail')}</Link>
          <h1 className="text-2xl font-semibold">{t('exam.enterMarks')}</h1>
        </div>
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !editable}>
          {t('exam.saveMarks')}
        </button>
      </header>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>{t('enrollments.studentNo')}</th>
              <th>{t('enrollments.student')}</th>
              <th className="w-28">{t('exam.mark')}</th>
              <th className="w-24">{t('exam.grade')}</th>
            </tr>
          </thead>
          <tbody>
            {marks.data!.map((row, index) => {
              const value = draft[row.studentId] ?? '';
              const numeric = value.trim() === '' ? null : Number(value);
              const invalid = numeric !== null && (!Number.isFinite(numeric) || numeric < 0 || numeric > maxScore);
              return (
                <tr key={row.studentId}>
                  <td>{index + 1}</td>
                  <td className="font-mono text-xs">{row.studentNo}</td>
                  <td>{row.fullName}</td>
                  <td>
                    <input
                      aria-label={`${t('exam.mark')} ${row.fullName}`}
                      className={`input w-20 text-right ${invalid ? 'border-red-500' : ''}`}
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [row.studentId]: e.target.value }))}
                    />
                    {invalid && <p className="text-[10px] text-red-600">0–{maxScore}</p>}
                  </td>
                  <td className="text-xs text-slate-500">{row.grade ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('app.loading') : t('exam.saveMarks')}
        </button>
        <p className="text-xs text-slate-500">{t('exam.blankNote')}</p>
      </div>
    </div>
  );
}

export type { MarksMeta };
