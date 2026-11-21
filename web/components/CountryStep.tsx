'use client';

import { useI18n } from '@/lib/i18n';
import { Icon } from './icons';
import { Actions, Button, Field, OptionCard, StepHeader } from './ui';

const COUNTRIES = [
  { code: 'CO', color: 'text-accent-blue' },
  { code: 'PE', color: 'text-accent-pink' },
  { code: 'MX', color: 'text-accent-green' },
  { code: 'EC', color: 'text-accent-purple' },
  { code: 'CL', color: 'text-accent-orange' },
] as const;

export function CountryStep({
  countryCode,
  onChange,
  onContinue,
}: {
  countryCode: string;
  onChange: (code: string) => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const isListed = COUNTRIES.some((c) => c.code === countryCode);
  const validCode = /^[A-Za-z]{2}$/.test(countryCode);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validCode) onContinue();
      }}
    >
      <StepHeader icon="globe" title={t.country.title} subtitle={t.country.subtitle} />
      <div role="radiogroup" aria-label={t.country.groupLabel} className="grid grid-cols-2 gap-3">
        {COUNTRIES.map((c) => (
          <OptionCard
            key={c.code}
            icon={c.code}
            iconClass={c.color}
            title={t.country.options[c.code].name}
            description={t.country.options[c.code].document}
            selected={countryCode === c.code}
            onSelect={() => onChange(c.code)}
          />
        ))}
        <OptionCard
          icon={<Icon name="spark" className="size-5" />}
          iconClass="text-subtle"
          title={t.country.otherTitle}
          description={t.country.otherDescription}
          selected={!isListed}
          onSelect={() => onChange('')}
        />
      </div>
      {!isListed && (
        <Field
          className="mt-4"
          label={t.country.isoLabel}
          hint={t.country.isoHint}
          placeholder={t.country.isoPlaceholder}
          maxLength={2}
          autoFocus
          value={countryCode}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      )}
      <Actions>
        <span />
        <Button type="submit" disabled={!validCode}>
          {t.actions.continue}
        </Button>
      </Actions>
    </form>
  );
}
