'use client';

import { useEffect, useState } from 'react';
import { api, type AuditEvent, type Verdict } from '@/lib/api';
import { Icon, type IconName } from './icons';
import { Actions, Button, ErrorBanner, StepHeader, VerdictBadge } from './ui';

const EVENT_COPY: Record<AuditEvent['eventType'], { label: string; icon: IconName; tone: string }> = {
  VALIDATION_CREATED: { label: 'Identity validated', icon: 'idCard', tone: 'bg-canvas text-muted' },
  VALIDATION_FAILED: { label: 'Failed attempt', icon: 'x', tone: 'bg-error-soft text-error' },
  DOCUMENT_GENERATED: { label: 'Document generated', icon: 'file', tone: 'bg-canvas text-muted' },
  DOCUMENT_SIGNED: { label: 'Document signed', icon: 'pen', tone: 'bg-success-soft text-success' },
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
  const [data, setData] = useState<{ documentKey: string; events: AuditEvent[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.timeline(countryCode, documentNumber).then(setData, setError);
  }, [countryCode, documentNumber]);

  return (
    <div>
      <StepHeader
        icon="list"
        title="Audit trail"
        subtitle={
          <>
            Every event of <span className="font-mono text-ink">{countryCode}#{documentNumber}</span>, read
            from DynamoDB with one query. Events are append-only.
          </>
        }
      />
      <ErrorBanner error={error} />

      {data && (
        <ol className="flex flex-col">
          {data.events.map((event, i) => {
            const copy = EVENT_COPY[event.eventType];
            const last = i === data.events.length - 1;
            const extra = details(event);
            return (
              <li key={event.eventId} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${copy.tone}`}>
                    <Icon name={copy.icon} className="size-4" />
                  </span>
                  {!last && <span className="my-1 w-px flex-1 bg-line" />}
                </div>
                <div className={`flex min-w-0 flex-col gap-0.5 ${last ? '' : 'pb-5'}`}>
                  <span className="flex flex-wrap items-center gap-2 pt-1 text-sm font-semibold text-ink">
                    {copy.label}
                    {event.verdict && <VerdictBadge verdict={event.verdict as Verdict} />}
                  </span>
                  <span className="text-xs text-subtle">{new Date(event.occurredAt).toLocaleString()}</span>
                  {extra && <span className="break-all font-mono text-xs text-subtle">{extra}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-2">
        {[
          ['PK documentKey', 'country#document: the whole history in one query'],
          ['SK sk', 'timestamp#eventId: chronological order, no collisions'],
          ['GSI phone-index', 'phone → documents, for the shared-phone signal'],
          ['Append-only', 'conditional writes: events are never overwritten'],
        ].map(([term, description]) => (
          <div key={term}>
            <dt className="font-mono text-xs font-medium text-ink">{term}</dt>
            <dd className="mt-0.5 text-xs text-subtle">{description}</dd>
          </div>
        ))}
      </dl>

      <Actions>
        <Button type="button" variant="secondary" icon="chevronLeft" onClick={onBack}>
          Go back
        </Button>
        <Button onClick={onRestart}>New validation</Button>
      </Actions>
    </div>
  );
}
