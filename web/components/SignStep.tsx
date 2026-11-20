'use client';

import { useState, type FormEvent } from 'react';
import { api, type DocumentRecord } from '@/lib/api';
import { Button, Card, ErrorBanner, Field } from './ui';

function nextYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Accepts "1500000", "1.500.000" or "1.500.000,50" (Colombian format). */
function parseAmount(value: string): number {
  return Number(value.replace(/[^\d,]/g, '').replace(',', '.'));
}

function formatElapsed(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function SignStep({
  validationId,
  onTimeline,
}: {
  validationId: string;
  onTimeline: () => void;
}) {
  const [form, setForm] = useState({
    amount: '1500000',
    currency: 'COP',
    dueDate: nextYear(),
    creditorName: 'Banco Demo S.A.',
    city: '',
  });
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    const created = await run(() =>
      api.createPromissoryNote(validationId, {
        amount: parseAmount(form.amount),
        currency: form.currency,
        dueDate: form.dueDate,
        creditorName: form.creditorName,
        ...(form.city.trim() && { city: form.city }),
      }),
    );
    if (created) setDocument(created);
  }

  async function sign() {
    if (!document) return;
    const signed = await run(() => api.sign(document.id));
    if (signed) setDocument(signed);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start gap-7 px-6 py-10">
      <Card className="min-w-0 flex-[1_1_340px] !p-7">
        <form onSubmit={generate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight">Promissory note</h1>
            <p className="text-sm leading-relaxed text-muted">
              Filled with the validated identity. Only approved validations can generate documents.
            </p>
          </div>
          <Field label="Amount" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency" value={form.currency} onChange={set('currency')} />
            <Field label="Due date" type="date" value={form.dueDate} onChange={set('dueDate')} />
          </div>
          <Field label="Creditor" value={form.creditorName} onChange={set('creditorName')} />
          <Field
            label="City"
            placeholder="Capital of the country"
            hint="Empty: the capital returned by the countries API"
            value={form.city}
            onChange={set('city')}
          />
          <Button type="submit" variant="secondary" disabled={busy || document?.status === 'SIGNED'}>
            {document ? 'Generate a new version' : 'Generate document'}
          </Button>
        </form>
      </Card>

      <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
        <ErrorBanner error={error} />
        {document ? (
          <>
            <article className="flex flex-col gap-3.5 rounded-xl border border-line bg-white px-6 py-8 sm:px-10">
              <pre lang="es" className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-[#23303d]">
                {document.content}
              </pre>
              <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-field pt-4">
                <span className="text-xs text-subtle">SHA-256 recorded in the audit trail</span>
                <code className="break-all font-mono text-xs">{document.contentHash}</code>
              </div>
            </article>
            <div className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-line bg-white px-6 py-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-subtle">Validation to signature</span>
                <span className="font-mono text-[28px] font-medium">
                  {document.signature ? formatElapsed(document.signature.elapsedMs) : '--:--'}
                </span>
                <span className="text-xs text-subtle">
                  AUCO reported 46 s per signature in 2022 (Portafolio)
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                {document.status === 'SIGNED' ? (
                  <Button onClick={onTimeline}>See audit timeline</Button>
                ) : (
                  <Button onClick={sign} disabled={busy}>
                    Sign document
                  </Button>
                )}
                <span className="text-xs text-subtle">
                  {document.signature
                    ? `Signed from ${document.signature.ip}`
                    : 'Records time, IP and user agent'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-field p-8 text-center text-sm text-subtle">
            The generated document and its hash appear here.
          </div>
        )}
      </section>
    </main>
  );
}
