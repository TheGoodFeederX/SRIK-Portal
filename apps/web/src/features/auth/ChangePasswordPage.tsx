import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { apiPost } from '@/lib/api';
import { useAuth, mustChangePassword as isForced } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';

/**
 * Forced/voluntary password change (spec v1.1-PROD-R2 §11).
 * The credential lives in Managed Auth; the application only clears `must_change_password`
 * after the auth service confirms the change.
 */
export function ChangePasswordPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { state, refresh, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const forced = isForced(state);

  if (state === 'loading') return <div className="p-8">{t('app.loading')}</div>;
  if (state === 'signed-out') return <Navigate to="/login" replace />;
  if (state === 'authenticated-active' && !forced) {
    // Voluntary change is allowed too; show the same form.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 12) return setError(t('password.tooShort'));
    if (next !== confirm) return setError(t('password.mismatch'));
    if (!authClient) return setError(t('app.error.server'));
    setBusy(true);
    try {
      const result = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (result?.error) {
        setError(t('password.failed'));
        return;
      }
      await apiPost('/auth/password-changed');
      await refresh();
      toast(t('password.changed'));
      navigate('/app', { replace: true });
    } catch {
      setError(t('password.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="w-full max-w-sm">
        <form className="card space-y-4" onSubmit={submit}>
          <div className="flex items-center gap-2 text-brand-800">
            <KeyRound className="h-5 w-5" />
            <h1 className="text-lg font-semibold">{t('password.title')}</h1>
          </div>
          {forced && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('password.forced')}</p>}
          <div>
            <label className="label" htmlFor="current">
              {t('password.current')}
            </label>
            <input
              id="current"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="next">
              {t('password.new')}
            </label>
            <input
              id="next"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t('password.confirm')}
            </label>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t('app.loading') : t('password.submit')}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => void signOut()}>
            {t('state.signOut')}
          </button>
        </form>
      </main>
    </div>
  );
}
