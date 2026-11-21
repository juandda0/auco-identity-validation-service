'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, Page } from './ui';

const COUNTRIES = [
  ['CO', 'Colombia'],
  ['PE', 'Peru'],
  ['EC', 'Ecuador'],
  ['MX', 'Mexico'],
  ['CL', 'Chile'],
  ['AR', 'Argentina'],
  ['US', 'United States'],
  ['ES', 'Spain'],
  ['ZZ', 'ZZ · does not exist (shows the 422)'],
] as const;

export interface ValidateResult {
  validationId: string;
  countryCode: string;
  documentNumber: string;
}

export function ValidateStep({
  lastDocument,
  onValidated,
}: {
  lastDocument: string | null;
  onValidated: (result: ValidateResult) => void;
}) {
  const [form, setForm] = useState({
    name: 'Ana Gómez',
    documentNumber: '1.020.304.050',
    countryCode: 'CO',
    phone: '+57 300 123 4567',
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createValidation({
        name: form.name,
        documentNumber: form.documentNumber,
        countryCode: form.countryCode,
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

  function loadFraudScenario() {
    // Same document as the last validation (or the default one) under another name.
    setForm((f) => ({
      ...f,
      name: 'Carlos Ruiz',
      documentNumber: lastDocument ?? '1020304050',
      countryCode: 'CO',
    }));
  }

  return (
    <Page className="lg:flex-row lg:items-start">
      <Card className="min-w-0 lg:flex-1">
        <div className="mb-5 flex flex-col gap-2 sm:mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Validate identity</h1>
          <p className="text-sm leading-relaxed text-muted sm:text-[15px]">
            We enrich the record with public country data, check it against the audit history and
            store it with an immutable audit event.
          </p>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            className="sm:col-span-2"
            label="Full name"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            autoComplete="name"
          />
          <Field
            label="Document number"
            hint="Dots and dashes are ignored"
            value={form.documentNumber}
            onChange={(e) => set('documentNumber')(e.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Country
            <select
              value={form.countryCode}
              onChange={(e) => set('countryCode')(e.target.value)}
              className="h-12 rounded-lg border border-field bg-white px-3 text-base font-normal text-ink sm:h-11 sm:text-[15px]"
            >
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-subtle">Optional in the API · defaults to CO</span>
          </label>
          <Field
            className="sm:col-span-2"
            label="Phone"
            hint="Optional · E.164 format, used by the shared-phone signal"
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
            autoComplete="tel"
          />
          <div className="flex flex-col gap-3 pt-1 sm:col-span-2 sm:flex-row sm:pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Validating…' : 'Validate identity'}
            </Button>
            <Button type="button" variant="secondary" onClick={loadFraudScenario}>
              Load a fraud scenario
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorBanner error={error} />
          </div>
        </form>
      </Card>

      <aside className="flex min-w-0 flex-col gap-4 lg:w-80 lg:shrink-0">
        <Card className="sm:!p-6">
          <h2 className="mb-4 text-[15px] font-semibold">What happens when you validate</h2>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-snug text-[#374251]">
            <li>Country data from the World Bank API (3 s timeout, one retry)</li>
            <li>Risk check against this document&apos;s and this phone&apos;s history in DynamoDB</li>
            <li>Record stored in MongoDB, event appended to the audit trail</li>
          </ol>
        </Card>
        <div className="rounded-xl border border-[#d3dfea] bg-[#eef3f8] p-5 text-[13px] leading-normal text-[#23384d]">
          Simulated in this demo: ID photo, liveness check, national registry and watch lists,
          WhatsApp delivery. The fraud scenario reuses the last document under another name.
        </div>
      </aside>
    </Page>
  );
}
