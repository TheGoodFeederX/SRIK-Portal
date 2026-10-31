import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth, isOperational } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';

type Status = { state: 'signed-out' | 'authenticated-active' | 'no-invitation' | 'invitation-pending' | 'invitation-expired'; email?: string };

/** Onboarding (spec §72): authenticate → activate the invitation → operate. */
export function OnboardingPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { state, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ['onboarding', 'status'], queryFn: () => apiGet<Status>('/onboarding/status') });

  useEffect(() => {
    if (state === 'signed-out') void status.refetch();
  }, [state, status]);

  if (isOperational(state)) return <Navigate to="/app" replace />;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/onboarding/accept');
      toast(t('onboarding.activated'));
      await refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? mapCode(err.error.code, t) : t('app.error.server'));
    } finally {
      setBusy(false);
    }
  }

  const current = status.data?.state ?? 'signed-out';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="card w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold">{t('onboarding.title')}</h1>
        {current === 'signed-out' && (
          <>
            <p className="text-sm text-slate-600">{t('onboarding.needSignIn')}</p>
            <Link to="/login" className="btn-primary w-full">
              {t('login.title')}
            </Link>
          </>
        )}
        {current === 'invitation-pending' && (
          <>
            <p className="text-sm text-slate-600">{t('onboarding.found').replace('{email}', status.data?.email ?? '')}</p>
            <button className="btn-primary w-full" onClick={accept} disabled={busy}>
              {busy ? t('app.loading') : t('onboarding.activate')}
            </button>
          </>
        )}
        {current === 'invitation-expired' && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('onboarding.expired')}</p>}
        {current === 'no-invitation' && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{t('state.notLinked')}</p>
        )}
        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">
          {t('login.title')}
        </Link>
      </main>
    </div>
  );
}

export function mapCode(code: string, t: (key: 'onboarding.expired' | 'state.notLinked' | 'state.suspended' | 'state.disabled' | 'state.roleless' | 'state.invited' | 'invitation.used' | 'invitation.emailMismatch' | 'app.error.server') => string): string {
  switch (code) {
    case 'INVITATION_EXPIRED':
      return t('onboarding.expired');
    case 'INVITATION_NOT_FOUND':
    case 'INVITATION_CANCELLED':
      return t('invitation.used');
    case 'INVITATION_EMAIL_MISMATCH':
      return t('invitation.emailMismatch');
    case 'APP_ACCOUNT_SUSPENDED':
      return t('state.suspended');
    case 'APP_ACCOUNT_DISABLED':
      return t('state.disabled');
    case 'APP_ROLE_NOT_ASSIGNED':
      return t('state.roleless');
    case 'APP_ACCOUNT_INVITED':
      return t('state.invited');
    case 'APP_PROFILE_NOT_LINKED':
      return t('state.notLinked');
    default:
      return t('app.error.server');
  }
}
