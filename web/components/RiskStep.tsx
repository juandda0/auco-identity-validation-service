'use client';

import { useEffect, useState } from 'react';
import { api, type Validation, type Verdict } from '@/lib/api';
import { Button, Card, ErrorBanner, Mono, Page, VerdictBadge } from './ui';

const COPY: Record<Verdict, { title: string; subtitle: string; ring: string; icon: string }> = {
  APPROVED: {
    title: 'Approved',
    subtitle: 'No risk signals in the audit history.',
    ring: 'border-line',
    icon: 'bg-approved-soft text-approved',
  },
  REVIEW: {
    title: 'Needs review',
    subtitle: 'The record was stored, but documents cannot be generated until it is approved.',
    ring: 'border-[#e8d3b0]',
    icon: 'bg-review-soft text-review',
  },
  BLOCKED: {
    title: 'Blocked',
    subtitle: 'The record was stored for traceability. No documents can be generated.',
    ring: 'border-[#ebc8c8]',
    icon: 'bg-blocked-soft text-blocked',
  },
};

export function RiskStep({
  validationId,
  onContinue,
  onRestart,
  onTimeline,
}: {
  validationId: string;
  onContinue: () => void;
  onRestart: () => void;
  onTimeline: () => void;
}) {
  const [validation, setValidation] = useState<Validation | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.getValidation(validationId).then(setValidation, setError);
  }, [validationId]);

  if (error) {
    return (
      <Page>
        <ErrorBanner error={error} />
      </Page>
    );
  }
  if (!validation) {
    return (
      <Page>
        <p className="text-muted">Loading…</p>
      </Page>
    );
  }

  const { verdict, reasons } = validation.risk;
  const copy = COPY[verdict];

  return (
    <Page>
      <Card className={`flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between ${copy.ring}`}>
        <div className="flex items-start gap-4 sm:items-center sm:gap-5">
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-full sm:size-16 ${copy.icon}`}>
            <svg className="size-6 sm:size-8" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {verdict === 'APPROVED' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><path d="M12 8v5" /><path d="M12 16.5v.5" /><path d="M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></>}
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wider text-muted sm:text-[13px]">VERDICT</span>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">{copy.title}</h1>
            <span className="text-sm text-muted sm:text-[15px]">
              {copy.subtitle}{' '}
              <span className="block sm:inline">
                <Mono>{validation.countryCode}#{validation.documentNumber}</Mono>
              </span>
            </span>
          </div>
        </div>
        {verdict === 'APPROVED' ? (
          <Button onClick={onContinue}>Continue to promissory note</Button>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onTimeline}>
              See audit timeline
            </Button>
            <Button onClick={onRestart}>Start a new validation</Button>
          </div>
        )}
      </Card>

      {reasons.length > 0 && (
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold sm:mb-4">Why</h2>
          <ul className="flex flex-col gap-3">
            {reasons.map((r) => (
              <li key={r.code} className={`flex flex-col items-start gap-2 rounded-lg p-4 sm:flex-row sm:gap-3.5 ${r.verdict === 'BLOCKED' ? 'bg-blocked-soft' : 'bg-[#fdf7ec]'}`}>
                <VerdictBadge verdict={r.verdict} />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{r.message}</span>
                  <span className="font-mono text-xs text-subtle">{r.code}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Validated person</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
            <Item label="Name">{validation.name}</Item>
            <Item label="Document"><Mono>{validation.documentNumber}</Mono></Item>
            <Item label="Phone"><Mono>{validation.phone ?? '—'}</Mono></Item>
            <Item label="Validation id"><Mono>{validation.id}</Mono></Item>
          </dl>
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Country enrichment</h2>
            <span className="text-xs text-subtle">World Bank API</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
            <Item label="Country">{validation.country.name} ({validation.country.code})</Item>
            <Item label="Capital">{validation.country.capital ?? '—'}</Item>
            <Item label="Region">{validation.country.region}</Item>
            <Item label="Income level">{validation.country.incomeLevel}</Item>
          </dl>
        </Card>
      </div>
    </Page>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 break-words">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
