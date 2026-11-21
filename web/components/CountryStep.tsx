'use client';

import { Icon } from './icons';
import { Actions, Button, Field, OptionCard, StepHeader } from './ui';

const COUNTRIES = [
  { code: 'CO', name: 'Colombia', description: 'Cédula de ciudadanía', color: 'text-[#1570ef]' },
  { code: 'PE', name: 'Peru', description: 'DNI', color: 'text-[#dd2590]' },
  { code: 'MX', name: 'Mexico', description: 'INE / CURP', color: 'text-[#079455]' },
  { code: 'EC', name: 'Ecuador', description: 'Cédula de identidad', color: 'text-[#7a5af8]' },
  { code: 'CL', name: 'Chile', description: 'RUN', color: 'text-[#ef6820]' },
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
  const isListed = COUNTRIES.some((c) => c.code === countryCode);
  const validCode = /^[A-Za-z]{2}$/.test(countryCode);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validCode) onContinue();
      }}
    >
      <StepHeader
        icon="globe"
        title="Where is the document from?"
        subtitle="We enrich the record with public country data (World Bank API)."
      />
      <div role="radiogroup" aria-label="Country" className="grid grid-cols-2 gap-3">
        {COUNTRIES.map((c) => (
          <OptionCard
            key={c.code}
            icon={c.code}
            iconClass={c.color}
            title={c.name}
            description={c.description}
            selected={countryCode === c.code}
            onSelect={() => onChange(c.code)}
          />
        ))}
        <OptionCard
          icon={<Icon name="spark" className="size-5" />}
          iconClass="text-subtle"
          title="Another country"
          description="Any ISO code"
          selected={!isListed}
          onSelect={() => onChange('')}
        />
      </div>
      {!isListed && (
        <Field
          className="mt-4"
          label="ISO 3166-1 alpha-2 code"
          hint="Try ZZ to see how an unknown country is handled (422)."
          placeholder="e.g. AR"
          maxLength={2}
          autoFocus
          value={countryCode}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      )}
      <Actions>
        <span />
        <Button type="submit" disabled={!validCode}>
          Continue
        </Button>
      </Actions>
    </form>
  );
}
