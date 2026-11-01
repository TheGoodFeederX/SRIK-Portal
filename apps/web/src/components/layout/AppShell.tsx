import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { GraduationCap, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/app/providers/auth';
import { PORTFOLIOS, availableFor, type ModuleNavigationEntry } from '@/app/navigation/portfolioRegistry';
import { useI18n } from '@/i18n/context';
import type { TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';

export function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const { user: session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const crumbs = buildCrumbs(location.pathname).map((c) => ({ path: c.path, label: crumbLabel(c.label, t) }));

  const nav = (
    <nav className="space-y-6" aria-label={t('app.menu')}>
      <NavLink to="/app" end onClick={() => setOpen(false)} className={navClass}>
        <LayoutDashboard className="h-4 w-4" />
        {t('app.dashboard')}
      </NavLink>
      {PORTFOLIOS.map((p) => {
        const entries = availableFor(session, p.id);
        return (
          <div key={p.id}>
            <NavLink to={p.path} onClick={() => setOpen(false)} className={navClass}>
              <span className="font-semibold">{t(p.titleKey)}</span>
            </NavLink>
            {entries.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {entries.map((e: ModuleNavigationEntry) => (
                  <li key={e.id}>
                    <NavLink to={e.path} onClick={() => setOpen(false)} className={cn(navClass, 'text-sm font-normal')}>
                      {t(e.titleKey)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Skip link: keyboard users land on the main content immediately. */}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white">
        {t('app.dashboard')}
      </a>

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          className="btn-ghost"
          aria-expanded={open}
          aria-controls="sidebar"
          aria-label={open ? t('app.close') : t('app.menu')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/app" className="flex items-center gap-2 font-semibold text-brand-800">
          <GraduationCap className="h-5 w-5" />
          {t('app.name')}
        </Link>
        <span className="w-10" />
      </header>

      <aside
        id="sidebar"
        className={cn(
          'w-full shrink-0 border-r border-slate-200 bg-white p-4 lg:block lg:w-64',
          open ? 'block' : 'hidden',
        )}
      >
        <Link to="/app" className="mb-6 hidden items-center gap-2 px-2 font-semibold text-brand-800 lg:flex">
          <GraduationCap className="h-5 w-5" />
          {t('app.name')}
        </Link>
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-6 py-3 lg:flex">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
            {crumbs.map((c, i) => (
              <span key={c.path}>
                {i > 0 && <span className="px-2">/</span>}
                <Link to={c.path} className="hover:text-brand-700">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <select
              aria-label="Bahasa"
              className="input w-auto"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'ms' | 'en')}
            >
              <option value="ms">BM</option>
              <option value="en">EN</option>
            </select>
            <span className="text-sm text-slate-700">{session?.displayName}</span>
            <button className="btn-ghost" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              {t('app.logout')}
            </button>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const navClass = 'flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-brand-50';

const titles: Record<string, TranslationKey> = {
  administration: 'portfolio.administration.title',
    academic: 'portfolio.academic.title',
    hem: 'portfolio.hem.title',
    cocurricular: 'portfolio.cocurricular.title',
    staff: 'staff.title',
    students: 'student.title',
    attendance: 'attendance.title',
    classes: 'classes.title',
  'audit-log': 'audit.title',
};

const titleFor = (segment: string): TranslationKey | null => titles[segment] ?? null;

function buildCrumbs(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: { path: string; label: string }[] = [];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    const key = titleFor(part);
    crumbs.push({ path: acc, label: key ? `__i18n__:${key}` : part });
  }
  return crumbs;
}

const crumbLabel = (label: string, t: (k: TranslationKey) => string) =>
  label.startsWith('__i18n__:') ? t(label.slice(9) as TranslationKey) : label;
