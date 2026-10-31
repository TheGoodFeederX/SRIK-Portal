import { Link, useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { useI18n } from '@/i18n/context';

/** Honest empty state for modules listed in the registry but not yet built. */
export function PlaceholderPage() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <div className="card max-w-xl">
      <Construction className="h-6 w-6 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold">{t('readiness.placeholder')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('placeholder.body')}</p>
      <code className="mt-3 block rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{pathname}</code>
      <Link to="/app" className="btn-ghost mt-4 w-fit">
        {t('app.dashboard')}
      </Link>
    </div>
  );
}
