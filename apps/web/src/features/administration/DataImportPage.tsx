import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';
import { IMPORT_SPECS, IMPORT_TYPES, type ImportType } from '@srik/shared';

type Session = {
  id: string;
  type: ImportType;
  filename: string;
  status: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  summary: { total: number; valid: number; warnings: number; invalid: number; duplicates: number; conflicts: number } | null;
  createdAt: string;
};
type Row = {
  rowNumber: number;
  status: 'VALID' | 'WARNING' | 'INVALID' | 'DUPLICATE' | 'CONFLICT' | 'IMPORTED' | 'SKIPPED';
  rawData: Record<string, string>;
  errors: { column?: string; message: string }[] | null;
  warnings: { column?: string; message: string }[] | null;
  resolution: string | null;
};
type SessionDetail = Session & { rows: Row[] };

const STATUS_STYLE: Record<string, string> = {
  VALID: 'bg-brand-100 text-brand-800',
  WARNING: 'bg-amber-100 text-amber-900',
  INVALID: 'bg-red-100 text-red-800',
  DUPLICATE: 'bg-slate-200 text-slate-700',
  CONFLICT: 'bg-orange-100 text-orange-900',
  IMPORTED: 'bg-emerald-100 text-emerald-900',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

/** Data onboarding workspace (spec v1.4.1 §21–§23, §37–§38). ADMIN only. */
export function DataImportPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<ImportType>('STAFF');
  const [file, setFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const canImport = user?.permissions.includes('system.data.import') ?? false;

  const history = useQuery({ queryKey: ['imports'], queryFn: () => apiGet<{ data: Session[] }>('/imports'), enabled: canImport });
  const detail = useQuery({
    queryKey: ['import', sessionId],
    queryFn: () => apiGet<SessionDetail>(`/imports/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no file');
      const fd = new FormData();
      fd.set('type', type);
      fd.set('file', file);
      const res = await fetch('/api/v1/imports', { method: 'POST', body: fd, credentials: 'include' });
      const body = await res.json();
      if (!res.ok) throw new ApiFailure(res.status, body.error ?? { code: 'IMPORT_FILE_INVALID', message: 'Muat naik gagal.' });
      return body.data as { id: string };
    },
    onSuccess: async (data) => {
      setSessionId(data.id);
      await qc.invalidateQueries({ queryKey: ['imports'] });
      toast(t('import.uploaded'));
      validate.mutate(data.id);
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const validate = useMutation({
    mutationFn: (id: string) => apiPost(`/imports/${id}/validate`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['imports'] });
      if (sessionId) await qc.invalidateQueries({ queryKey: ['import', sessionId] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => apiPost<{ imported: number; skipped: number }>(`/imports/${id}/confirm`),
    onSuccess: async (data) => {
      toast(`${t('import.confirmed')} — ${data.imported} ${t('import.imported')}, ${data.skipped} ${t('import.skipped')}`);
      await qc.invalidateQueries({ queryKey: ['imports'] });
      if (sessionId) await qc.invalidateQueries({ queryKey: ['import', sessionId] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/imports/${id}/cancel`),
    onSuccess: async () => {
      toast(t('import.cancelled'));
      await qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  const resolve = useMutation({
    mutationFn: ({ id, rowNumber, resolution }: { id: string; rowNumber: number; resolution: 'SKIP' | 'REPLACE' }) =>
      apiPost(`/imports/${id}/resolutions`, { rows: [{ rowNumber, resolution }] }),
    onSuccess: async () => {
      if (sessionId) await qc.invalidateQueries({ queryKey: ['import', sessionId] });
    },
    onError: (e: Error) => toast(failureMessage(e, t), 'error'),
  });

  if (!canImport) return <EmptyState message={t('app.error.forbidden')} />;

  const summary = detail.data?.summary;
  const rows = detail.data?.rows ?? [];
  const unresolvedErrors = rows.filter((r) => r.status === 'INVALID').length;
  const readyToConfirm = detail.data?.status === 'PREVIEW_READY';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('import.title')}</h1>

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">{t('import.new')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="import-type">{t('import.entity')}</label>
            <select id="import-type" className="input" value={type} onChange={(e) => setType(e.target.value as ImportType)}>
              {IMPORT_TYPES.map((it) => (
                <option key={it} value={it}>{IMPORT_SPECS[it].labelMs}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="import-file">{t('import.file')}</label>
            <input
              id="import-file"
              className="input"
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            <Upload className="h-4 w-4" />
            {upload.isPending ? t('app.loading') : t('import.upload')}
          </button>
          <a className="btn-ghost" href={`/api/v1/imports/templates/${type}`} download>
            <Download className="h-4 w-4" />
            {t('import.template')} — {IMPORT_SPECS[type].filename}
          </a>
        </div>
        <p className="text-xs text-slate-500">{t('import.note')}</p>
      </section>

      {detail.isLoading ? (
        <LoadingState rows={4} />
      ) : detail.isError ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : detail.data ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {t('import.preview')} — {detail.data.filename}
            </h2>
            <span className="badge bg-slate-100 text-slate-700">{detail.data.status}</span>
          </div>

          {summary && (
            <div className="grid gap-3 sm:grid-cols-6 text-sm">
              {(
                [
                  ['total', t('import.total')],
                  ['valid', t('import.valid')],
                  ['warnings', t('import.warnings')],
                  ['invalid', t('import.invalid')],
                  ['duplicates', t('import.duplicates')],
                  ['conflicts', t('import.conflicts')],
                ] as const
              ).map(([key, label]) => (
                <p key={key} className="card py-2">
                  <span className="block text-xs text-slate-500">{label}</span>
                  {summary[key]}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => validate.mutate(detail.data!.id)} disabled={validate.isPending}>
              {t('import.revalidate')}
            </button>
            <button
              className="btn-primary"
              disabled={!readyToConfirm || confirm.isPending}
              onClick={() => confirm.mutate(detail.data!.id)}
              title={unresolvedErrors ? t('import.blocked') : undefined}
            >
              {t('import.confirm')}
            </button>
            <button className="btn-ghost" onClick={() => cancel.mutate(detail.data!.id)} disabled={detail.data.status === 'COMPLETED'}>
              {t('app.cancel')}
            </button>
          </div>
          {unresolvedErrors > 0 && <p className="text-xs text-amber-800">{t('import.blocked')}</p>}

          {rows.length === 0 ? (
            <EmptyState message={t('app.empty')} />
          ) : (
            <div className="card max-h-96 overflow-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12">#</th>
                    <th>{t('import.identifier')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('import.messages')}</th>
                    <th>{t('import.resolution')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td className="font-mono text-xs">
                        {r.rawData.staff_no ?? r.rawData.student_no ?? r.rawData.subject_code ?? r.rawData.class_name ?? '—'}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                      </td>
                      <td className="text-xs text-slate-600">
                        {(r.errors ?? []).map((e, i) => (
                          <p key={`e${i}`} className="text-red-700">{e.column ? `${e.column}: ` : ''}{e.message}</p>
                        ))}
                        {(r.warnings ?? []).map((w, i) => (
                          <p key={`w${i}`} className="text-amber-700">{w.message}</p>
                        ))}
                      </td>
                      <td>
                        {r.status === 'CONFLICT' ? (
                          <select
                            aria-label={`${t('import.resolution')} ${r.rowNumber}`}
                            className="input w-auto text-xs"
                            value={r.resolution ?? 'SKIP'}
                            onChange={(e) =>
                              resolve.mutate({ id: detail.data!.id, rowNumber: r.rowNumber, resolution: e.target.value as 'SKIP' | 'REPLACE' })
                            }
                          >
                            <option value="SKIP">{t('import.skip')}</option>
                            <option value="REPLACE">{t('import.replace')}</option>
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">{r.resolution ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t('import.history')}</h2>
        {history.isLoading ? (
          <LoadingState rows={3} />
        ) : history.isError ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : (history.data?.data.length ?? 0) === 0 ? (
          <EmptyState message={t('app.empty')} />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('audit.time')}</th>
                  <th>{t('import.entity')}</th>
                  <th>{t('import.file')}</th>
                  <th>{t('import.total')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {history.data!.data.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap text-xs">{new Date(s.createdAt).toLocaleString('ms-MY')}</td>
                    <td className="text-xs">{IMPORT_SPECS[s.type].labelMs}</td>
                    <td className="text-xs">{s.filename}</td>
                    <td>{s.rowCount}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-700">{s.status}</span>
                    </td>
                    <td>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSessionId(s.id)}>
                        {t('exam.open')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function failureMessage(
  e: Error,
  t: (k: 'app.error.server' | 'app.error.forbidden' | 'import.blocked' | 'import.stale' | 'import.alreadyConfirmed') => string,
) {
  if (e instanceof ApiFailure) {
    if (e.error.code === 'IMPORT_STALE_PREVIEW') return t('import.stale');
    if (e.error.code === 'IMPORT_ALREADY_CONFIRMED') return t('import.alreadyConfirmed');
    if (e.error.code === 'FORBIDDEN' || e.status === 403) return t('app.error.forbidden');
    return e.error.message;
  }
  return t('app.error.server');
}
