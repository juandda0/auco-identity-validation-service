export type AuditEventType =
  'VALIDATION_CREATED' | 'VALIDATION_FAILED' | 'DOCUMENT_GENERATED' | 'DOCUMENT_SIGNED';

/**
 * One immutable row of the audit trail.
 *
 * Keys (see README, "DynamoDB key design"):
 *   PK documentKey = "<countryCode>#<documentNumber>"  -> a person's full history in one Query
 *   SK sk          = "<ISO timestamp>#<eventId>"       -> chronological order + range queries,
 *                                                         the suffix avoids same-millisecond collisions
 *                                                         (events inside one millisecond are treated
 *                                                         as concurrent: their relative order is undefined)
 *   GSI phone-index (PK phone, SK sk)                  -> "same phone used by several people"
 */
export interface AuditEvent {
  documentKey: string;
  sk: string;
  eventId: string;
  eventType: AuditEventType;
  occurredAt: string;
  countryCode: string;
  documentNumber: string;
  validationId?: string;
  name?: string;
  normalizedName?: string;
  phone?: string;
  verdict?: string;
  reasons?: string[];
  documentId?: string;
  contentHash?: string;
  ip?: string;
  detail?: string;
}

export function documentKeyOf(countryCode: string, documentNumber: string): string {
  return `${countryCode}#${documentNumber}`;
}

export function sortKeyOf(occurredAt: string, eventId: string): string {
  return `${occurredAt}#${eventId}`;
}
