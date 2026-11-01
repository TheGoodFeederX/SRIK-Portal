import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, type AuthState } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import type { TranslationKey } from '@/i18n';

const MESSAGE: Partial<Record<AuthState, TranslationKey>> = {
  'authenticated-unlinked': 'state.notLinked',
  'authenticated-invited': 'state.invited',
  'authenticated-suspended': 'state.suspended',
  'authenticated-disabled': 'state.disabled',
  'authenticated-roleless': 'state.roleless',
};

/** Explicit screen for an authenticated identity that has no application access (spec §50–52, §95). */
export function AccountStatePage() {
  const { state, signOut, refresh } = useAuth();
  const { t } = useI18n();
  const key = MESSAGE[state] ?? 'app.error.server';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <main className="card w-full max-w-md space-y-4 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" />
        <h1 className="text-lg font-semibold">{t('app.name')}</h1>
        <p role="alert" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(key)}
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-ghost" onClick={() => void refresh()}>
            {t('state.retry')}
          </button>
          <button className="btn-ghost" onClick={() => void signOut()}>
            {t('state.signOut')}
          </button>
        </div>
        {state === 'authenticated-invited' && (
          <Link to="/onboarding" className="text-sm text-brand-700 hover:underline">
            {t('onboarding.title')}
          </Link>
        )}
      </main>
    </div>
  );
}
