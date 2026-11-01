import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { authClient, authConfigured } from '@/lib/auth-client';
import { useAuth, isOperational } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';

export function LoginPage() {
  const { t } = useI18n();
  const { state, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state !== 'loading' && isOperational(state)) return <Navigate to="/app" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!authClient) {
      setError('Konfigurasi pengesahan tidak lengkap.');
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) {
        setError(t('login.failed'));
        return;
      }
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
    } catch {
      setError(t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-brand-800">
          <GraduationCap className="h-7 w-7" />
          <div>
            <p className="text-lg font-semibold leading-tight">{t('app.name')}</p>
            <p className="text-xs text-slate-500">{t('app.school')}</p>
          </div>
        </div>
        <form className="card space-y-4" onSubmit={submit}>
          <div>
            <h1 className="text-lg font-semibold">{t('login.title')}</h1>
            <p className="text-sm text-slate-600">{t('login.subtitle')}</p>
          </div>
          {!authConfigured && (
            <p role="alert" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('login.notConfigured')}
            </p>
          )}
          <div>
            <label className="label" htmlFor="email">
              {t('login.email')}
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t('login.password')}
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
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
          <button className="btn-primary w-full" disabled={busy || !authConfigured}>
            {busy ? t('app.loading') : t('login.submit')}
          </button>
          <div className="flex justify-between text-sm">
            <Link to="/lupa-kata-laluan" className="text-brand-700 hover:underline">
              {t('login.forgot')}
            </Link>
          </div>
          <p className="text-xs text-slate-500">{t('login.managedByAdmin')}</p>
        </form>
      </main>
    </div>
  );
}
