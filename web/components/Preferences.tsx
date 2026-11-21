'use client';

import { LOCALES, useI18n, type Locale } from '@/lib/i18n';
import { THEMES, useTheme, type ThemePreference } from '@/lib/theme';
import { Icon, type IconName } from './icons';

const THEME_ICONS: Record<ThemePreference, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

/** Segmented control: a radio group styled as a row of small buttons. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
  title,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  render: (option: T) => React.ReactNode;
  title: (option: T) => string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={title(option)}
            title={title(option)}
            onClick={() => onChange(option)}
            className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
              selected ? 'bg-surface text-ink shadow-xs ring-1 ring-line' : 'text-subtle hover:text-ink'
            }`}
          >
            {render(option)}
          </button>
        );
      })}
    </div>
  );
}

export function Preferences() {
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <Segmented<Locale>
        label={t.prefs.language}
        value={locale}
        options={LOCALES}
        onChange={setLocale}
        render={(option) => option.toUpperCase()}
        title={(option) => (option === 'en' ? 'English' : 'Español')}
      />
      <Segmented<ThemePreference>
        label={t.prefs.theme}
        value={preference}
        options={THEMES}
        onChange={setPreference}
        render={(option) => <Icon name={THEME_ICONS[option]} className="size-4" />}
        title={(option) => t.prefs[option]}
      />
    </div>
  );
}
