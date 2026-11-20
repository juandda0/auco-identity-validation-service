import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '../src/audit/audit-event.js';
import { assessRisk, type RiskInput } from '../src/risk/risk-engine.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<AuditEvent>): AuditEvent {
  const occurredAt = overrides.occurredAt ?? NOW.toISOString();
  return {
    documentKey: 'CO#1020304050',
    sk: `${occurredAt}#id`,
    eventId: 'id',
    eventType: 'VALIDATION_CREATED',
    occurredAt,
    countryCode: 'CO',
    documentNumber: '1020304050',
    normalizedName: 'ana gomez',
    ...overrides,
  };
}

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    documentKey: 'CO#1020304050',
    normalizedName: 'ana gomez',
    phone: '+573001234567',
    documentHistory: [],
    phoneHistory: [],
    now: NOW,
    ...overrides,
  };
}

const failures = (count: number, hoursAgo: number) =>
  Array.from({ length: count }, () =>
    event({
      eventType: 'VALIDATION_FAILED',
      occurredAt: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    }),
  );

describe('assessRisk', () => {
  it('approves a document with a clean history', () => {
    expect(assessRisk(input())).toEqual({ verdict: 'APPROVED', reasons: [] });
  });

  it('approves the same person coming back with the same name', () => {
    const result = assessRisk(input({ documentHistory: [event({})], phoneHistory: [event({})] }));
    expect(result.verdict).toBe('APPROVED');
  });

  it('sends to REVIEW a document previously validated under a different name', () => {
    const result = assessRisk(
      input({ documentHistory: [event({ normalizedName: 'carlos ruiz' })] }),
    );
    expect(result).toEqual({
      verdict: 'REVIEW',
      reasons: [
        {
          code: 'DOCUMENT_NAME_MISMATCH',
          verdict: 'REVIEW',
          message: 'This document was previously validated under 1 different name',
        },
      ],
    });
  });

  it('sends to REVIEW a phone linked to another document and BLOCKS it at three', () => {
    const otherDocs = (n: number) =>
      Array.from({ length: n }, (_, i) => event({ documentKey: `CO#99999${i}` }));

    expect(assessRisk(input({ phoneHistory: otherDocs(1) })).reasons[0]).toMatchObject({
      code: 'SHARED_PHONE',
      verdict: 'REVIEW',
    });
    expect(assessRisk(input({ phoneHistory: otherDocs(3) }))).toMatchObject({
      verdict: 'BLOCKED',
      reasons: [{ code: 'SHARED_PHONE', message: 'This phone is linked to 3 other documents' }],
    });
  });

  it('ignores the phone signal when there is no phone', () => {
    const otherDoc = event({ documentKey: 'CO#999999' });
    expect(assessRisk(input({ phone: null, phoneHistory: [otherDoc] })).verdict).toBe('APPROVED');
  });

  it('BLOCKS after three failed attempts in 24 hours, but ignores older ones', () => {
    expect(assessRisk(input({ documentHistory: failures(2, 1) })).verdict).toBe('APPROVED');
    expect(assessRisk(input({ documentHistory: failures(3, 25) })).verdict).toBe('APPROVED');
    expect(assessRisk(input({ documentHistory: failures(3, 1) }))).toMatchObject({
      verdict: 'BLOCKED',
      reasons: [
        { code: 'REPEATED_FAILURES', message: '3 failed validation attempts in the last 24 hours' },
      ],
    });
  });

  it('returns every reason and the most severe verdict', () => {
    const result = assessRisk(
      input({
        documentHistory: [event({ normalizedName: 'carlos ruiz' }), ...failures(3, 1)],
      }),
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reasons.map((r) => r.code)).toEqual([
      'DOCUMENT_NAME_MISMATCH',
      'REPEATED_FAILURES',
    ]);
  });
});
