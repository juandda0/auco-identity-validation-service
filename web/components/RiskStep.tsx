'use client';

import { useEffect, useState } from 'react';
import { api, type Validation, type Verdict } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { IconName } from './icons';
import { Icon } from './icons';
import { Actions, Button, ErrorBanner, Mono, StepHeader, VerdictBadge } from './ui';

const LOOK: Record<Verdict, { icon: IconName; tone: 'success' | 'warning' | 'error' }> = {
  APPROVED: { icon: 'check', tone: 'success' },
  REVIEW: { icon: 'alert', tone: 'warning' },
  BLOCKED: { icon: 'x', tone: 'error' },
};

const SIGNALS = ['DOCUMENT_NAME_MISMATCH', 'SHARED_PHONE', 'REPEATED_FAILURES'] as const;

/**
 * The API explains each reason in English ("linked to 3 other documents").
 * The UI translates it by code and only reuses the number from that message.
 */
function countIn(message: string): number {
  return Number(/\d+/.exec(message)?.[0] ?? 1);
}

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
  const { t } = useI18n();
  const [validation, setValidation] = useState<Validation | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.getValidation(validationId).then(setValidation, setError);
  }, [validationId]);

  if (error) return <ErrorBanner error={error} />;
  if (!validation) return <p className="text-sm text-subtle">{t.loading}</p>;

  const { verdict, reasons } = validation.risk;
  const look = LOOK[verdict];

  return (
    <div>
      <StepHeader icon={look.icon} tone={look.tone} title={t.risk[verdict].title} subtitle={t.risk[verdict].subtitle} />

      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {SIGNALS.map((code) => {
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
                  {t.risk.signals[code]}
                  {reason && <VerdictBadge verdict={reason.verdict} />}
                </span>
                <span className="text-xs text-subtle sm:text-sm">{reason ? t.risk.reasons[code](countIn(reason.message)) : t.risk.noSignal}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-canvas p-4 text-sm">
        <Item label={t.risk.name}>{validation.name}</Item>
        <Item label={t.risk.document}>
          <Mono>
            {validation.countryCode}#{validation.documentNumber}
          </Mono>
        </Item>
        <Item label={t.risk.country}>
          {validation.country.name} · {validation.country.capital ?? '—'}
        </Item>
        <Item label={t.risk.region}>{validation.country.region}</Item>
      </dl>

      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          {t.actions.back}
        </Button>
        {verdict === 'APPROVED' ? (
          <Button onClick={onContinue}>{t.actions.continue}</Button>
        ) : (
          <Button onClick={onTimeline}>{t.risk.seeAudit}</Button>
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
