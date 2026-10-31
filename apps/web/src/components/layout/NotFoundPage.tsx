import { Link } from 'react-router-dom';
import { Link2Off } from 'lucide-react';
import { useI18n } from '@/i18n/context';

/** 404 page. `inShell` renders it inside the app layout instead of full screen. */
export function NotFoundPage({ inShell = false }: { inShell?: boolean }) {
  const { t } = useI18n();
  const content = (
    <div className="card mx-auto max-w-md text-center">
      <Link2Off className="mx-auto h-8 w-8 text-slate-400" />
      <h1 className="mt-3 text-xl font-semibold">404</h1>
      <p className="mt-1 text-sm text-slate-600">{t('app.notFound')}</p>
      <Link to="/app" className="btn-primary mt-4">
        {t('app.dashboard')}
      </Link>
    </div>
  );
  if (inShell) return <div className="py-8">{content}</div>;
  return <div className="flex min-h-screen items-center justify-center p-6">{content}</div>;
}
