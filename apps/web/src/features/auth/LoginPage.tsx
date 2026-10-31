import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';

export function LoginPage() {
  const { t } = useI18n();
  const { session, isLoading } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => apiPost('/auth/login', { email, password }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['session'] });
      navigate((location.state as { from?: string } | null)?.from ?? '/app', { replace: true });
    },
  });

  if (!isLoading && session) return <Navigate to="/app" replace />;

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
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div>
            <h1 className="text-lg font-semibold">{t('login.title')}</h1>
            <p className="text-sm text-slate-600">{t('login.subtitle')}</p>
          </div>
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
          {login.isError && (
            <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {t('login.failed')}
            </p>
          )}
          <button className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? t('app.loading') : t('login.submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
