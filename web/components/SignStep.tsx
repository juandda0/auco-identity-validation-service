'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type DocumentRecord } from '@/lib/api';
import { Icon } from './icons';
import { Actions, Button, ErrorBanner, Field, StepHeader } from './ui';

/** Same day next year, in the browser's local date (toISOString would use UTC). */
function nextYear(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear() + 1}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  onBack,
  onContinue,
}: {
  validationId: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [form, setForm] = useState({
    amount: '1.500.000',
    currency: 'COP',
    dueDate: nextYear(),
    creditorName: 'Banco Demo S.A.',
    city: '',
  });
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLElement>(null);
  const documentId = document?.id;

  // On phones the preview sits below the form: bring a new document into view.
  useEffect(() => {
    if (documentId) preview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [documentId]);

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

  const signed = document?.status === 'SIGNED';

  return (
    <div>
      <StepHeader
        icon="file"
        title="Generate and sign the promissory note"
        subtitle="Filled with the validated identity. Its SHA-256 goes to the immutable audit trail."
      />

      <form onSubmit={generate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount" inputMode="decimal" value={form.amount} onChange={set('amount')} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency" maxLength={3} value={form.currency} onChange={set('currency')} />
          <Field label="Due date" type="date" value={form.dueDate} onChange={set('dueDate')} />
        </div>
        <Field label="Creditor" value={form.creditorName} onChange={set('creditorName')} />
        <Field
          label="City (optional)"
          placeholder="Capital of the country"
          value={form.city}
          onChange={set('city')}
        />
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" icon="file" disabled={busy || signed} className="w-full">
            {document ? 'Generate a new version' : 'Generate document'}
          </Button>
        </div>
      </form>

      <ErrorBanner error={error} />

      {document && (
        <article ref={preview} className="mt-6 scroll-mt-28 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-2.5">
            <span className="text-xs font-medium text-muted">Promissory note · demo, no legal value</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                signed ? 'border-[#abefc6] bg-success-soft text-success' : 'border-line bg-white text-muted'
              }`}
            >
              {signed ? 'Signed' : 'Pending signature'}
            </span>
          </div>
          <pre lang="es" className="whitespace-pre-wrap break-words px-4 py-5 font-sans text-sm leading-relaxed text-ink sm:px-6">
            {document.content}
          </pre>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-2">
              <Icon name="hash" className="mt-0.5 size-4 shrink-0 text-subtle" />
              <code className="break-all font-mono text-xs text-muted">{document.contentHash}</code>
            </div>
            <div className="flex shrink-0 flex-col sm:items-end">
              <span className="font-mono text-lg font-medium text-ink">
                {document.signature ? formatElapsed(document.signature.elapsedMs) : '--:--'}
              </span>
              <span className="text-xs text-subtle">validation → signature (AUCO cited 46 s, 2022)</span>
            </div>
          </div>
        </article>
      )}

      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          Go back
        </Button>
        {signed ? (
          <Button onClick={onContinue}>Continue</Button>
        ) : (
          <Button onClick={sign} disabled={!document || busy} icon="pen">
            Sign document
          </Button>
        )}
      </Actions>
    </div>
  );
}
