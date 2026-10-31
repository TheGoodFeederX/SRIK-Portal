import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';

export type Staff = {
  id: string;
  staffNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  joinDate: string;
  employmentType: string;
  employmentStatus: string;
};

type List<T> = { data: T[]; meta: { total: number } };

export function StaffPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const canWrite = session?.permissions.includes('staff.write') ?? false;
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const staffQuery = useQuery({
    queryKey: ['staff', q],
    queryFn: () => apiGet<List<Staff>>(`/staff?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost('/staff', body),
    onSuccess: async () => {
      toast(t('staff.created'));
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => toast(e instanceof ApiFailure ? e.error.message : t('app.error.server'), 'error'),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('staff.title')}</h1>
        <div className="flex gap-2">
          <label className="relative">
            <span className="sr-only">{t('staff.search')}</span>
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-8" placeholder={t('staff.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {canWrite && (
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              {t('staff.new')}
            </button>
          )}
        </div>
      </header>

      {showForm && canWrite && (
        <StaffForm
          submitting={create.isPending}
          onCancel={() => setShowForm(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {staffQuery.isLoading ? (
        <LoadingState rows={5} />
      ) : staffQuery.isError ? (
        <ErrorState onRetry={() => staffQuery.refetch()} />
      ) : (staffQuery.data?.data.length ?? 0) === 0 ? (
        <EmptyState message={t('app.empty')} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('staff.no')}</th>
                <th>{t('staff.name')}</th>
                <th>{t('staff.email')}</th>
                <th>{t('staff.phone')}</th>
                <th>{t('staff.joinDate')}</th>
                <th>{t('staff.status')}</th>
              </tr>
            </thead>
            <tbody>
              {staffQuery.data!.data.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.staffNo}</td>
                  <td>{s.fullName}</td>
                  <td>{s.email ?? '—'}</td>
                  <td>{s.phone ?? '—'}</td>
                  <td>{s.joinDate}</td>
                  <td>
                    <span className={s.employmentStatus === 'ACTIVE' ? 'badge bg-brand-100 text-brand-800' : 'badge bg-slate-100 text-slate-600'}>
                      {t('status.ACTIVE')}
                    </span>
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

function StaffForm({ onSubmit, onCancel, submitting }: { onSubmit: (v: Record<string, unknown>) => void; onCancel: () => void; submitting: boolean }) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    staffNo: '',
    fullName: '',
    email: '',
    phone: '',
    joinDate: new Date().toISOString().slice(0, 10),
    employmentType: 'PERMANENT',
  });

  return (
    <form
      className="card grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...values, email: values.email || null, phone: values.phone || null });
      }}
    >
      <div>
        <label className="label" htmlFor="staffNo">{t('staff.no')}</label>
        <input id="staffNo" className="input" required maxLength={30} value={values.staffNo} onChange={(e) => setValues({ ...values, staffNo: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="fullName">{t('staff.name')}</label>
        <input id="fullName" className="input" required maxLength={200} value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="staffEmail">{t('staff.email')}</label>
        <input id="staffEmail" type="email" className="input" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="staffPhone">{t('staff.phone')}</label>
        <input id="staffPhone" className="input" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="joinDate">{t('staff.joinDate')}</label>
        <input id="joinDate" type="date" className="input" required value={values.joinDate} onChange={(e) => setValues({ ...values, joinDate: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="empType">{t('staff.type')}</label>
        <select id="empType" className="input" value={values.employmentType} onChange={(e) => setValues({ ...values, employmentType: e.target.value })}>
          <option value="PERMANENT">PERMANENT</option>
          <option value="CONTRACT">CONTRACT</option>
          <option value="PART_TIME">PART_TIME</option>
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={submitting}>{t('app.save')}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>{t('app.cancel')}</button>
      </div>
    </form>
  );
}
