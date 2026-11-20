'use client';

import { useEffect, useState } from 'react';
import { api, type AuditEvent, type Verdict } from '@/lib/api';
import { Button, Card, ErrorBanner, VerdictBadge } from './ui';

function describe(event: AuditEvent): string {
  const parts = [event.occurredAt];
  if (event.validationId) parts.push(`validation ${event.validationId.slice(0, 8)}…`);
  if (event.contentHash) parts.push(`sha256 ${event.contentHash.slice(0, 12)}…`);
  if (event.ip) parts.push(`ip ${event.ip}`);
  if (event.detail) parts.push(event.detail);
  return parts.join(' · ');
}

export function AuditStep({
  countryCode,
  documentNumber,
  onRestart,
}: {
  countryCode: string;
  documentNumber: string;
  onRestart: () => void;
}) {
  const [data, setData] = useState<{ documentKey: string; events: AuditEvent[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.timeline(countryCode, documentNumber).then(setData, setError);
  }, [countryCode, documentNumber]);

  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-wrap items-start gap-7 px-6 py-10">
      <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-bold tracking-tight">Audit timeline</h1>
          <code className="rounded-md bg-[#eef3f8] px-2.5 py-1 font-mono text-sm text-navy">
            {countryCode}#{documentNumber}
          </code>
        </div>
        <ErrorBanner error={error} />
        {data && (
          <ol className="flex flex-col">
            {data.events.map((event, i) => {
              const last = i === data.events.length - 1;
              return (
                <li key={event.eventId} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 size-3.5 rounded-full ${event.eventType === 'VALIDATION_FAILED' ? 'bg-blocked' : last ? 'bg-approved' : 'bg-navy'}`} />
                    {!last && <span className="w-0.5 flex-1 bg-navy-soft" />}
                  </div>
                  <div className={`flex min-w-0 flex-col gap-1 ${last ? '' : 'pb-6'}`}>
                    <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {event.eventType}
                      {event.verdict && <VerdictBadge verdict={event.verdict as Verdict} />}
                    </span>
                    <span className="break-all font-mono text-xs text-subtle">{describe(event)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <Button variant="secondary" className="self-start" onClick={onRestart}>
          Start a new validation
        </Button>
      </Card>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-xl bg-ink p-6 text-[#e8ecf1]">
        <h2 className="text-[15px] font-semibold text-white">How it is stored</h2>
        <dl className="flex flex-col gap-3 text-[13px] leading-normal">
          {[
            ['PK documentKey', 'country#document: the whole history in one Query'],
            ['SK sk', 'timestamp#eventId: chronological order, no collisions'],
            ['GSI phone-index', 'phone → documents, for the shared-phone signal'],
            ['Append-only', 'conditional writes: events are never overwritten'],
          ].map(([term, description]) => (
            <div key={term}>
              <dt className="font-mono text-[#9fc3e6]">{term}</dt>
              <dd className="mt-0.5">{description}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </main>
  );
}
