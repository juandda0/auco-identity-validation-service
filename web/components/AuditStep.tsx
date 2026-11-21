'use client';

import { useEffect, useState } from 'react';
import { api, type AuditEvent, type Verdict } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon, type IconName } from './icons';
import { Actions, Button, ErrorBanner, StepHeader, VerdictBadge } from './ui';

const EVENT_LOOK: Record<AuditEvent['eventType'], { icon: IconName; tone: string }> = {
  VALIDATION_CREATED: { icon: 'idCard', tone: 'bg-canvas text-muted' },
  VALIDATION_FAILED: { icon: 'x', tone: 'bg-error-soft text-error' },
  DOCUMENT_GENERATED: { icon: 'file', tone: 'bg-canvas text-muted' },
  DOCUMENT_SIGNED: { icon: 'pen', tone: 'bg-success-soft text-success' },
};

function details(event: AuditEvent): string {
  const parts: string[] = [];
  if (event.contentHash) parts.push(`sha256 ${event.contentHash.slice(0, 12)}…`);
  if (event.ip) parts.push(`ip ${event.ip}`);
  if (event.detail) parts.push(event.detail);
  return parts.join(' · ');
}

export function AuditStep({
  countryCode,
  documentNumber,
  onBack,
  onRestart,
}: {
  countryCode: string;
  documentNumber: string;
  onBack: () => void;
  onRestart: () => void;
}) {
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<{ documentKey: string; events: AuditEvent[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.timeline(countryCode, documentNumber).then(setData, setError);
  }, [countryCode, documentNumber]);

  return (
    <div>
      <StepHeader
        icon="list"
        title={t.audit.title}
        subtitle={
          <>
            {t.audit.subtitleBefore}{' '}
            <span className="font-mono text-ink">
              {countryCode}#{documentNumber}
            </span>
            {t.audit.subtitleAfter}
          </>
        }
      />
      <ErrorBanner error={error} />

      {data && (
        <ol className="flex flex-col">
          {data.events.map((event, i) => {
            const look = EVENT_LOOK[event.eventType];
            const last = i === data.events.length - 1;
            const extra = details(event);
            return (
              <li key={event.eventId} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${look.tone}`}>
                    <Icon name={look.icon} className="size-4" />
                  </span>
                  {!last && <span className="my-1 w-px flex-1 bg-line" />}
                </div>
                <div className={`flex min-w-0 flex-col gap-0.5 ${last ? '' : 'pb-5'}`}>
                  <span className="flex flex-wrap items-center gap-2 pt-1 text-sm font-semibold text-ink">
                    {t.audit.events[event.eventType]}
                    {event.verdict && <VerdictBadge verdict={event.verdict as Verdict} />}
                  </span>
                  <span className="text-xs text-subtle">{formatDate(event.occurredAt)}</span>
                  {extra && <span className="break-all font-mono text-xs text-subtle">{extra}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-2">
        {[
          ['PK documentKey', t.audit.keys.pk],
          ['SK sk', t.audit.keys.sk],
          ['GSI phone-index', t.audit.keys.gsi],
          [t.audit.appendOnly, t.audit.keys.appendOnly],
        ].map(([term, description]) => (
          <div key={term}>
            <dt className="font-mono text-xs font-medium text-ink">{term}</dt>
            <dd className="mt-0.5 text-xs text-subtle">{description}</dd>
          </div>
        ))}
      </dl>

      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          {t.actions.back}
        </Button>
        <Button onClick={onRestart}>{t.audit.newValidation}</Button>
      </Actions>
    </div>
  );
}
