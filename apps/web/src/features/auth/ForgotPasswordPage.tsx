import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/i18n/context';

/** Password reset request via Managed Auth (spec §41). No custom reset tokens are stored. */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authClient?.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-kata-laluan` });
    } finally {
      // Always report success: never reveal whether an account exists.
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-brand-800">
          <GraduationCap className="h-7 w-7" />
          <p className="text-lg font-semibold">{t('app.name')}</p>
        </div>
        <form className="card space-y-4" onSubmit={submit}>
          <h1 className="text-lg font-semibold">{t('forgot.title')}</h1>
          <p className="text-sm text-slate-600">{t('forgot.subtitle')}</p>
          <div>
            <label className="label" htmlFor="email">
              {t('login.email')}
            </label>
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {sent && (
            <p role="status" className="rounded bg-brand-50 px-3 py-2 text-sm text-brand-900">
              {t('forgot.sent')}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy || sent}>
            {busy ? t('app.loading') : t('forgot.submit')}
          </button>
          <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">
            {t('login.title')}
          </Link>
        </form>
      </main>
    </div>
  );
}

/** Landing page for the reset link sent by email; the token lives in Managed Auth. */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token || !authClient) {
      setError(t('forgot.invalidLink'));
      return;
    }
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result?.error) setError(result.error.message ?? t('app.error.server'));
    else setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="w-full max-w-sm">
        <form className="card space-y-4" onSubmit={submit}>
          <h1 className="text-lg font-semibold">{t('forgot.resetTitle')}</h1>
          {done ? (
            <>
              <p role="status" className="rounded bg-brand-50 px-3 py-2 text-sm text-brand-900">
                {t('forgot.resetDone')}
              </p>
              <Link to="/login" className="btn-primary w-full">
                {t('login.title')}
              </Link>
            </>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="new-password">
                  {t('forgot.newPassword')}
                </label>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button className="btn-primary w-full">{t('forgot.resetSubmit')}</button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
