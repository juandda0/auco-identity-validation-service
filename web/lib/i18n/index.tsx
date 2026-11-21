'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { en, type Messages } from './en';
import { es } from './es';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Messages> = { en, es };
const STORAGE_KEY = 'locale';

interface I18nValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
  /** Formats dates for the current language. */
  formatDate: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Saved choice first, then the browser language, then English. */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be blocked (private mode); fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(initialLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this visit.
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-CO' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

  return (
    <I18nContext value={{ locale, t: DICTIONARIES[locale], setLocale, formatDate }}>
      {children}
    </I18nContext>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
