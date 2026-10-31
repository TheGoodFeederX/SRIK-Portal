import { ms } from './ms';
import { en } from './en';

export const dictionaries = { ms, en } as const;
export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof ms;

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries.ms[key] ?? key;
}
