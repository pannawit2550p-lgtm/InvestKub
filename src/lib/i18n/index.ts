import { en } from './en';
import { th } from './th';

export type Language = 'th' | 'en';
export type TranslationKey = keyof typeof th;

const dictionaries = { th, en } as const;

export function t(key: TranslationKey, language: Language = 'th'): string {
  return dictionaries[language][key] ?? dictionaries.th[key];
}
