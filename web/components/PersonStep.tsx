'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Actions, Button, ErrorBanner, Field, StepHeader } from './ui';

export interface PersonForm {
  name: string;
  documentNumber: string;
  phone: string;
}

export interface ValidationResult {
  validationId: string;
  countryCode: string;
  documentNumber: string;
}

export function PersonStep({
  countryCode,
  form,
  onChange,
  lastDocument,
  onBack,
  onValidated,
}: {
  countryCode: string;
  form: PersonForm;
  onChange: (form: PersonForm) => void;
  lastDocument: string | null;
  onBack: () => void;
  onValidated: (result: ValidationResult) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createValidation({
        name: form.name,
        documentNumber: form.documentNumber,
        countryCode,
        ...(form.phone.trim() && { phone: form.phone }),
      });
      const record = await api.getValidation(id);
      onValidated({
        validationId: id,
        countryCode: record.countryCode,
        documentNumber: record.documentNumber,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepHeader icon="idCard" title={t.person.title} subtitle={t.person.subtitle} />
      <div className="flex flex-col gap-4">
        <Field label={t.person.name} autoComplete="name" value={form.name} onChange={set('name')} />
        <Field
          label={t.person.document}
          hint={t.person.documentHint}
          inputMode="text"
          value={form.documentNumber}
          onChange={set('documentNumber')}
        />
        <Field
          label={t.person.phone}
          hint={t.person.phoneHint}
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set('phone')}
        />
      </div>
      <Button
        type="button"
        variant="link"
        className="mt-3 h-auto justify-start py-1 text-left"
        onClick={() =>
          // Same document as the last validation (or the default one) under another name.
          onChange({ ...form, name: 'Carlos Ruiz', documentNumber: lastDocument ?? '1020304050' })
        }
      >
        {t.person.fraud}
      </Button>
      <ErrorBanner error={error} />
      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          {t.actions.back}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t.person.submitting : t.person.submit}
        </Button>
      </Actions>
    </form>
  );
}
