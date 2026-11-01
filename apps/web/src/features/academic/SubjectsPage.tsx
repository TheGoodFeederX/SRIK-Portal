import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

export type Subject = { id: string; code: string; nameMs: string; nameEn: string | null; isActive: boolean };
type List<T> = { data: T[]; meta: { total: number } };

/** Subject management (spec v1.2 §8–§9). ADMIN writes, TEACHER reads. */
export function SubjectsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'all' | 'true' | 'false'>('all');
  const [showForm, setShowForm] = useState(false);

  const canManage = user?.permissions.includes('academic.subject.manage') ?? false;

  const subjects = useQuery({
    queryKey: ['subjects', q, active],
    queryFn: () =>
      apiGet<List<Subject>>(`/subjects?${new URLSearchParams({ ...(q ? { q } : {}), ...(active === 'all' ? {} : { active }) }).toString()}`),
  });

  const create = useMutation({
    mutationFn: (body: { code: string; nameMs: string; nameEn: string | null }) => apiPost('/subjects', body),
    onSuccess: async () => {
      toast(t('subjects.created'));
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['subjects'] });
      await qc.invalidateQueries({ queryKey: ['academic-summary'] });
    },
    onError: (e: Error) => toast(errorMessage(e, t), 'error'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiPatch(`/subjects/${id}`, { isActive }),
    onSuccess: async () => {
      toast(t('subjects.updated'));
      await qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (e: Error) => toast(errorMessage(e, t), 'error'),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('subjects.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <span className="sr-only">{t('subjects.search')}</span>
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-8" placeholder={t('subjects.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select aria-label={t('subjects.filter')} className="input w-auto" value={active} onChange={(e) => setActive(e.target.value as 'all')}>
            <option value="all">{t('subjects.filterAll')}</option>
            <option value="true">{t('common.active')}</option>
            <option value="false">{t('common.inactive')}</option>
          </select>
          {canManage && (
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              {t('subjects.add')}
            </button>
          )}
        </div>
      </header>

      {showForm && canManage && (
        <SubjectForm
          submitting={create.isPending}
          onCancel={() => setShowForm(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {subjects.isLoading ? (
        <LoadingState rows={5} />
      ) : subjects.isError ? (
        <ErrorState onRetry={() => subjects.refetch()} />
      ) : (subjects.data?.data.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('subjects.code')}</th>
                <th>{t('subjects.nameMs')}</th>
                <th>{t('subjects.nameEn')}</th>
                <th>{t('common.status')}</th>
                {canManage && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {subjects.data!.data.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.code}</td>
                  <td>{s.nameMs}</td>
                  <td className="text-slate-500">{s.nameEn ?? '—'}</td>
                  <td>
                    <span className={s.isActive ? 'badge bg-brand-100 text-brand-800' : 'badge bg-slate-100 text-slate-600'}>
                      {s.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}>
                        {s.isActive ? t('common.deactivate') : t('common.activate')}
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

function SubjectForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (v: { code: string; nameMs: string; nameEn: string | null }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState({ code: '', nameMs: '', nameEn: '' });
  return (
    <form
      className="card grid gap-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ code: values.code, nameMs: values.nameMs, nameEn: values.nameEn || null });
      }}
    >
      <div>
        <label className="label" htmlFor="subject-code">
          {t('subjects.code')}
        </label>
        <input id="subject-code" className="input" required maxLength={20} value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="subject-ms">
          {t('subjects.nameMs')}
        </label>
        <input id="subject-ms" className="input" required maxLength={100} value={values.nameMs} onChange={(e) => setValues({ ...values, nameMs: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="subject-en">
          {t('subjects.nameEn')}
        </label>
        <input id="subject-en" className="input" maxLength={100} value={values.nameEn} onChange={(e) => setValues({ ...values, nameEn: e.target.value })} />
      </div>
      <div className="flex gap-2 sm:col-span-3">
        <button className="btn-primary" disabled={submitting}>
          {t('app.save')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t('app.cancel')}
        </button>
      </div>
    </form>
  );
}

function errorMessage(e: Error, t: (k: 'app.error.server' | 'app.error.forbidden' | 'subjects.codeExists') => string) {
  if (e instanceof ApiFailure) {
    if (e.error.code === 'SUBJECT_CODE_EXISTS') return t('subjects.codeExists');
    if (e.status === 403) return t('app.error.forbidden');
    return e.error.message;
  }
  return t('app.error.server');
}
