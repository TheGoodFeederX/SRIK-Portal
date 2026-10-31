import { Link, useParams } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { useI18n } from '@/i18n/context';
import { PORTFOLIOS, registry } from '@/app/navigation/portfolioRegistry';
import type { PortfolioId } from '@/app/navigation/portfolioRegistry';

export function PortfolioLandingPage() {
  const { portfolio } = useParams<{ portfolio: PortfolioId }>();
  const { t } = useI18n();
  const meta = PORTFOLIOS.find((p) => p.id === portfolio) ?? PORTFOLIOS[0]!;
  const modules = registry.filter((e) => e.portfolio === meta.id).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t(meta.titleKey)}</h1>
        <p className="mt-1 text-sm text-slate-600">{t(meta.descriptionKey)}</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          return (
            <li key={m.id} className="card flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium text-slate-900">{t(m.titleKey)}</h2>
                  <span
                    className={
                      m.readiness === 'available'
                        ? 'badge bg-brand-100 text-brand-800'
                        : 'badge bg-slate-100 text-slate-600'
                    }
                  >
                    {t(`readiness.${m.readiness}` as 'readiness.available')}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{t(m.group)}</p>
              </div>
              {m.readiness === 'available' ? (
                <Link to={m.path} className="btn-primary mt-4 self-start">
                  {t('readiness.available')}
                </Link>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                  <Construction className="h-4 w-4" />
                  {t('placeholder.body')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
