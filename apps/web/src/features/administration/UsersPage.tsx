import { useState } from 'react';
import { Plus, UserCog } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';
import type { Staff } from '@/features/administration/StaffPage';

type UserRow = {
  profileId: string;
  email: string;
  displayName: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  authUserId: string | null;
  roles: string[];
  staffId: string | null;
  staffName: string | null;
  invitationStatus: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED' | null;
  updatedAt: string;
};

const STATUS_STYLE: Record<UserRow['status'], string> = {
  INVITED: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-brand-100 text-brand-800',
  SUSPENDED: 'bg-orange-100 text-orange-900',
  DISABLED: 'bg-slate-200 text-slate-700',
};

export function UsersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const canManage = user?.permissions.includes('system.user.manage') ?? false;
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiGet<UserRow[]>('/users'), enabled: canManage });
  const staff = useQuery({ queryKey: ['staff', 'ref'], queryFn: () => apiGet<{ data: Staff[] }>('/staff?limit=200'), enabled: canManage });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['users'] });
    await qc.invalidateQueries({ queryKey: ['session'] });
  };

  const invite = useMutation({
    mutationFn: (body: { email: string; staffId: string | null; intendedRole: 'TEACHER' | 'ADMIN' }) => apiPost('/users/invitations', body),
    onSuccess: async () => {
      toast(t('users.inviteSent'));
      setShowInvite(false);
      await invalidate();
    },
    onError: (e: Error) => toast(errorMessage(e, t), 'error'),
  });

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => apiPost(path, body),
    onSuccess: async () => {
      toast(t('users.statusSaved'));
      await invalidate();
    },
    onError: (e: Error) => toast(errorMessage(e, t), 'error'),
  });

  const roles = useMutation({
    mutationFn: ({ id, values }: { id: string; values: string[] }) => apiPut(`/users/${id}/roles`, { roles: values }),
    onSuccess: async () => {
      toast(t('users.roleSaved'));
      await invalidate();
    },
    onError: (e: Error) => toast(errorMessage(e, t), 'error'),
  });

  if (!canManage) {
    return <EmptyState message={t('app.error.forbidden')} />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-brand-700" />
          <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite((v) => !v)}>
          <Plus className="h-4 w-4" />
          {t('users.invite')}
        </button>
      </header>

      {showInvite && (
        <InviteForm
          staff={staff.data?.data ?? []}
          submitting={invite.isPending}
          onCancel={() => setShowInvite(false)}
          onSubmit={(values) => invite.mutate(values)}
        />
      )}

      {users.isLoading ? (
        <LoadingState rows={5} />
      ) : users.isError ? (
        <ErrorState onRetry={() => users.refetch()} />
      ) : (users.data?.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>{t('users.name')}</th>
                <th>{t('users.email')}</th>
                <th>{t('users.staff')}</th>
                <th>{t('users.role')}</th>
                <th>{t('users.appStatus')}</th>
                <th>{t('users.authLink')}</th>
                <th>{t('users.invitation')}</th>
                <th>{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.data!.map((u) => (
                <tr key={u.profileId}>
                  <td>{u.displayName}</td>
                  <td className="text-xs">{u.email}</td>
                  <td className="text-xs">{u.staffName ?? <span className="text-slate-400">{t('users.noStaff')}</span>}</td>
                  <td>
                    <select
                      aria-label={`${t('users.role')} ${u.displayName}`}
                      className="input w-auto text-xs"
                      value={u.roles.includes('ADMIN') ? 'ADMIN' : u.roles.includes('TEACHER') ? 'TEACHER' : ''}
                      onChange={(e) => roles.mutate({ id: u.profileId, values: e.target.value ? [e.target.value] : [] })}
                    >
                      <option value="">—</option>
                      <option value="TEACHER">TEACHER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_STYLE[u.status]}`}>{u.status}</span>
                  </td>
                  <td className="text-xs">{u.authUserId ? t('users.linked') : t('users.unlinked')}</td>
                  <td className="text-xs">{u.invitationStatus ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.status === 'ACTIVE' && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => action.mutate({ path: `/users/${u.profileId}/suspend` })}>
                          {t('users.suspend')}
                        </button>
                      )}
                      {(u.status === 'SUSPENDED' || u.status === 'DISABLED') && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => action.mutate({ path: `/users/${u.profileId}/reactivate` })}>
                          {t('users.reactivate')}
                        </button>
                      )}
                      {u.status !== 'DISABLED' && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => action.mutate({ path: `/users/${u.profileId}/disable` })}>
                          {t('users.disable')}
                        </button>
                      )}
                    </div>
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

function InviteForm({
  staff,
  onSubmit,
  onCancel,
  submitting,
}: {
  staff: Staff[];
  onSubmit: (v: { email: string; staffId: string | null; intendedRole: 'TEACHER' | 'ADMIN' }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const unlinked = staff.filter((s) => !(s as Staff & { profileId?: string | null }).profileId);
  const [staffId, setStaffId] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'ADMIN'>('TEACHER');

  return (
    <form
      className="card grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ email, staffId: staffId || null, intendedRole: role });
      }}
    >
      <h2 className="text-base font-semibold sm:col-span-2">{t('users.inviteTitle')}</h2>
      <div>
        <label className="label" htmlFor="invite-staff">
          {t('users.staff')}
        </label>
        <select
          id="invite-staff"
          className="input"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            const picked = unlinked.find((s) => s.id === e.target.value);
            if (picked?.email) setEmail(picked.email);
          }}
        >
          <option value="">—</option>
          {unlinked.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({s.staffNo})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="invite-email">
          {t('users.email')}
        </label>
        <input id="invite-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="invite-role">
          {t('users.role')}
        </label>
        <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'ADMIN')}>
          <option value="TEACHER">TEACHER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={submitting}>
          {t('users.inviteSubmit')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t('app.cancel')}
        </button>
      </div>
    </form>
  );
}

function errorMessage(e: Error, t: (k: 'users.lastAdmin' | 'app.error.server' | 'app.error.forbidden') => string) {
  if (e instanceof ApiFailure) {
    if (e.error.code === 'LAST_ADMIN') return t('users.lastAdmin');
    if (e.status === 403) return t('app.error.forbidden');
    return e.error.message;
  }
  return t('app.error.server');
}
