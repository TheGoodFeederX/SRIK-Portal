import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { translate, type Locale, type TranslationKey } from './index';

type I18n = { locale: Locale; setLocale: (l: Locale) => void; t: (key: TranslationKey) => string };
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (localStorage.getItem('srik.locale') as Locale) || 'ms');
  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale: (l) => {
        localStorage.setItem('srik.locale', l);
        document.documentElement.lang = l;
        setLocaleState(l);
      },
      t: (key) => translate(locale, key),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
