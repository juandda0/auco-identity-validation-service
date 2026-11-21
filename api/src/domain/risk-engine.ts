import type { AuditEvent } from './audit-event.js';

/*
 * Small rule-based risk engine inspired by the fraud signals AUCO published in
 * its September 2026 study (same document under different names, one phone tied
 * to several people, repeated failed validation attempts).
 *
 * It is a pure function: it receives the audit history already read from
 * DynamoDB and returns a verdict with human-readable reasons. No I/O, so every
 * rule is unit-tested in isolation. Thresholds are arbitrary and configurable.
 */

export type Verdict = 'APPROVED' | 'REVIEW' | 'BLOCKED';
export type RiskReasonCode = 'DOCUMENT_NAME_MISMATCH' | 'SHARED_PHONE' | 'REPEATED_FAILURES';

export interface RiskReason {
  code: RiskReasonCode;
  verdict: Exclude<Verdict, 'APPROVED'>;
  message: string;
}

export interface RiskAssessment {
  verdict: Verdict;
  reasons: RiskReason[];
}

export interface RiskInput {
  documentKey: string;
  normalizedName: string;
  phone: string | null;
  /** Every audit event of this document (PK query). */
  documentHistory: AuditEvent[];
  /** Every audit event that used this phone (GSI query). Empty when there is no phone. */
  phoneHistory: AuditEvent[];
  now: Date;
}

export const RISK_RULES = {
  /** A phone already used by this many other documents blocks the validation. */
  sharedPhoneBlockAt: 3,
  /** This many failed attempts inside the window block the validation. */
  failedAttemptsBlockAt: 3,
  failedAttemptsWindowMs: 24 * 60 * 60 * 1000,
} as const;

const SEVERITY: Record<Verdict, number> = { APPROVED: 0, REVIEW: 1, BLOCKED: 2 };

export function assessRisk(input: RiskInput, rules = RISK_RULES): RiskAssessment {
  const reasons = [
    documentNameMismatch(input),
    sharedPhone(input, rules.sharedPhoneBlockAt),
    repeatedFailures(input, rules.failedAttemptsBlockAt, rules.failedAttemptsWindowMs),
  ].filter((reason): reason is RiskReason => reason !== null);

  const verdict = reasons.reduce<Verdict>(
    (worst, reason) => (SEVERITY[reason.verdict] > SEVERITY[worst] ? reason.verdict : worst),
    'APPROVED',
  );
  return { verdict, reasons };
}

function documentNameMismatch({ documentHistory, normalizedName }: RiskInput): RiskReason | null {
  const otherNames = new Set(
    documentHistory
      .filter((e) => e.eventType === 'VALIDATION_CREATED' && e.normalizedName !== undefined)
      .map((e) => e.normalizedName)
      .filter((name) => name !== normalizedName),
  );
  if (otherNames.size === 0) return null;
  return {
    code: 'DOCUMENT_NAME_MISMATCH',
    verdict: 'REVIEW',
    message: `This document was previously validated under ${plural(otherNames.size, 'different name')}`,
  };
}

function sharedPhone(
  { phone, phoneHistory, documentKey }: RiskInput,
  blockAt: number,
): RiskReason | null {
  if (!phone) return null;
  const otherDocuments = new Set(
    phoneHistory
      .filter((e) => e.eventType === 'VALIDATION_CREATED' && e.documentKey !== documentKey)
      .map((e) => e.documentKey),
  );
  if (otherDocuments.size === 0) return null;
  return {
    code: 'SHARED_PHONE',
    verdict: otherDocuments.size >= blockAt ? 'BLOCKED' : 'REVIEW',
    message: `This phone is linked to ${plural(otherDocuments.size, 'other document')}`,
  };
}

function repeatedFailures(
  { documentHistory, now }: RiskInput,
  blockAt: number,
  windowMs: number,
): RiskReason | null {
  const since = now.getTime() - windowMs;
  const failures = documentHistory.filter(
    (e) => e.eventType === 'VALIDATION_FAILED' && Date.parse(e.occurredAt) >= since,
  ).length;
  if (failures < blockAt) return null;
  return {
    code: 'REPEATED_FAILURES',
    verdict: 'BLOCKED',
    message: `${plural(failures, 'failed validation attempt')} in the last ${windowMs / 3_600_000} hours`,
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
