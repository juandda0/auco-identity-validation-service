'use client';

import { useEffect, useState } from 'react';
import { api, type Validation, type Verdict } from '@/lib/api';
import type { IconName } from './icons';
import { Icon } from './icons';
import { Actions, Button, ErrorBanner, Mono, StepHeader, VerdictBadge } from './ui';

const COPY: Record<
  Verdict,
  { title: string; subtitle: string; icon: IconName; tone: 'success' | 'warning' | 'error' }
> = {
  APPROVED: {
    title: 'Identity approved',
    subtitle: 'No risk signals in the audit history. You can generate and sign a document.',
    icon: 'check',
    tone: 'success',
  },
  REVIEW: {
    title: 'Needs review',
    subtitle: 'The record was stored, but documents cannot be generated until it is approved.',
    icon: 'alert',
    tone: 'warning',
  },
  BLOCKED: {
    title: 'Blocked',
    subtitle: 'The record was stored for traceability. No documents can be generated.',
    icon: 'x',
    tone: 'error',
  },
};

const SIGNALS = [
  ['DOCUMENT_NAME_MISMATCH', 'Same document under another name'],
  ['SHARED_PHONE', 'Phone linked to other documents'],
  ['REPEATED_FAILURES', 'Failed attempts in the last 24 h'],
] as const;

export function RiskStep({
  validationId,
  onBack,
  onContinue,
  onTimeline,
}: {
  validationId: string;
  onBack: () => void;
  onContinue: () => void;
  onTimeline: () => void;
}) {
  const [validation, setValidation] = useState<Validation | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.getValidation(validationId).then(setValidation, setError);
  }, [validationId]);

  if (error) return <ErrorBanner error={error} />;
  if (!validation) return <p className="text-sm text-subtle">Loading…</p>;

  const { verdict, reasons } = validation.risk;
  const copy = COPY[verdict];

  return (
    <div>
      <StepHeader icon={copy.icon} tone={copy.tone} title={copy.title} subtitle={copy.subtitle} />

      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {SIGNALS.map(([code, label]) => {
          const reason = reasons.find((r) => r.code === code);
          return (
            <li key={code} className="flex items-start gap-3 p-3.5">
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                  reason ? (reason.verdict === 'BLOCKED' ? 'bg-error-soft text-error' : 'bg-warning-soft text-warning') : 'bg-success-soft text-success'
                }`}
              >
                <Icon name={reason ? 'alert' : 'check'} className="size-3.5" strokeWidth={2.2} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {label}
                  {reason && <VerdictBadge verdict={reason.verdict} />}
                </span>
                <span className="text-xs text-subtle sm:text-sm">{reason ? reason.message : 'No signal'}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-canvas p-4 text-sm">
        <Item label="Name">{validation.name}</Item>
        <Item label="Document">
          <Mono>
            {validation.countryCode}#{validation.documentNumber}
          </Mono>
        </Item>
        <Item label="Country">
          {validation.country.name} · {validation.country.capital ?? '—'}
        </Item>
        <Item label="Region">{validation.country.region}</Item>
      </dl>

      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          Go back
        </Button>
        {verdict === 'APPROVED' ? (
          <Button onClick={onContinue}>Continue</Button>
        ) : (
          <Button onClick={onTimeline}>See audit trail</Button>
        )}
      </Actions>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 break-words">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
