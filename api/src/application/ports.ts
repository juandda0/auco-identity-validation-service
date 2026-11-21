/**
 * Ports: what the application layer needs from the outside world.
 * Infrastructure implements them (MongoDB, DynamoDB, World Bank API) and the
 * composition root (src/container.ts) wires the implementations in.
 * Tests implement them in memory.
 */
import type { AuditEvent } from '../domain/audit-event.js';
import type { CountryInfo } from '../domain/country.js';
import type { DocumentRecord, Signature } from '../domain/document.js';
import type { ValidationRecord } from '../domain/validation.js';

export interface CountriesClient {
  /** Throws CountryNotFoundError, UpstreamUnavailableError or UpstreamTimeoutError. */
  getByCode(countryCode: string): Promise<CountryInfo>;
}

export interface ValidationRepository {
  insert(record: ValidationRecord): Promise<void>;
  findById(id: string): Promise<ValidationRecord | null>;
  deleteById(id: string): Promise<void>;
}

export interface DocumentRepository {
  insert(document: DocumentRecord): Promise<void>;
  findById(id: string): Promise<DocumentRecord | null>;
  deleteById(id: string): Promise<void>;
  /**
   * Atomically moves PENDING_SIGNATURE -> SIGNED. Returns false when the
   * document was already signed (e.g. a double click), so only one wins.
   */
  markSigned(id: string, signature: Signature): Promise<boolean>;
  /** Compensation when the signature cannot be audited. */
  revertSignature(id: string): Promise<void>;
}

export type NewAuditEvent = Omit<AuditEvent, 'documentKey' | 'sk' | 'eventId' | 'occurredAt'> & {
  occurredAt?: Date;
};

export interface AuditRepository {
  /** Append-only: an existing event is never overwritten. */
  append(event: NewAuditEvent): Promise<AuditEvent>;
  /** Oldest first: the sort key starts with the ISO timestamp. */
  listByDocument(documentKey: string): Promise<AuditEvent[]>;
  /** Oldest first, read from the phone-index GSI (eventually consistent). */
  listByPhone(phone: string): Promise<AuditEvent[]>;
}

/** The subset of a logger the use cases need (pino satisfies it). */
export interface Logger {
  warn(context: object, message: string): void;
  error(context: object, message: string): void;
}
