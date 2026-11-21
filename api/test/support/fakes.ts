import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AuditRepository,
  CountriesClient,
  DocumentRepository,
  IdempotencyBegin,
  IdempotencyStore,
  ValidationRepository,
} from '../../src/application/ports.js';
import { documentKeyOf, sortKeyOf, type AuditEvent } from '../../src/domain/audit-event.js';
import type { CountryInfo } from '../../src/domain/country.js';
import type { DocumentRecord } from '../../src/domain/document.js';
import type { ValidationRecord } from '../../src/domain/validation.js';

/** 24 hex characters, like a MongoDB ObjectId. */
export const newTestId = () => randomBytes(12).toString('hex');

export const COLOMBIA: CountryInfo = {
  code: 'CO',
  name: 'Colombia',
  region: 'Latin America & Caribbean',
  incomeLevel: 'Upper middle income',
  capital: 'Bogota',
};

/** Countries client whose behaviour each test can replace. */
export function fakeCountries(
  impl: CountriesClient['getByCode'] = async (code) => ({ ...COLOMBIA, code }),
): CountriesClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getByCode(code) {
      calls.push(code);
      return impl(code);
    },
  };
}

export function inMemoryValidations(): ValidationRepository & {
  items: Map<string, ValidationRecord>;
} {
  const items = new Map<string, ValidationRecord>();
  return {
    items,
    async insert(record) {
      items.set(record.id, structuredClone(record));
    },
    async findById(id) {
      const record = items.get(id);
      return record ? structuredClone(record) : null;
    },
    async deleteById(id) {
      items.delete(id);
    },
  };
}

/** Mirrors the DynamoDB repository: same keys, same ordering, same filters. */
export function inMemoryAudit(): AuditRepository & {
  events: AuditEvent[];
  failNextAppend: boolean;
  failReads: boolean;
} {
  const events: AuditEvent[] = [];
  const sorted = (list: AuditEvent[]) => [...list].sort((a, b) => a.sk.localeCompare(b.sk));
  const repo = {
    events,
    failNextAppend: false,
    failReads: false,
    async append(event: Parameters<AuditRepository['append']>[0]) {
      if (repo.failNextAppend) {
        repo.failNextAppend = false;
        throw new Error('DynamoDB is down');
      }
      const { occurredAt: date, ...rest } = event;
      const eventId = randomUUID();
      const occurredAt = (date ?? new Date()).toISOString();
      const item: AuditEvent = {
        ...rest,
        documentKey: documentKeyOf(event.countryCode, event.documentNumber),
        sk: sortKeyOf(occurredAt, eventId),
        eventId,
        occurredAt,
      };
      events.push(item);
      return item;
    },
    async listByDocument(documentKey: string) {
      if (repo.failReads) throw new Error('DynamoDB is down');
      return sorted(events.filter((e) => e.documentKey === documentKey));
    },
    async listByPhone(phone: string) {
      return sorted(events.filter((e) => e.phone === phone));
    },
  };
  return repo;
}

export const silentLogger = { error: () => undefined, warn: () => undefined };

export function inMemoryDocuments(): DocumentRepository & { items: Map<string, DocumentRecord> } {
  const items = new Map<string, DocumentRecord>();
  return {
    items,
    async insert(document) {
      items.set(document.id, structuredClone(document));
    },
    async findById(id) {
      const document = items.get(id);
      return document ? structuredClone(document) : null;
    },
    async deleteById(id) {
      items.delete(id);
    },
    async markSigned(id, signature) {
      const document = items.get(id);
      if (document?.status !== 'PENDING_SIGNATURE') return false;
      items.set(id, { ...document, status: 'SIGNED', signature });
      return true;
    },
    async revertSignature(id) {
      const document = items.get(id);
      if (document) items.set(id, { ...document, status: 'PENDING_SIGNATURE', signature: null });
    },
  };
}

/** Same semantics as the MongoDB store: atomic claim, mismatch, replay, stale takeover. */
export function inMemoryIdempotencyStore(): IdempotencyStore & {
  entries: Map<string, { requestHash: string; status: string; value?: unknown; createdAt: Date }>;
} {
  const entries = new Map<
    string,
    { requestHash: string; status: 'IN_PROGRESS' | 'COMPLETED'; value?: unknown; createdAt: Date }
  >();
  return {
    entries,
    async begin(id, requestHash, times): Promise<IdempotencyBegin> {
      const existing = entries.get(id);
      if (!existing) {
        entries.set(id, { requestHash, status: 'IN_PROGRESS', createdAt: times.now });
        return { state: 'new' };
      }
      if (existing.requestHash !== requestHash) return { state: 'mismatch' };
      if (existing.status === 'COMPLETED') return { state: 'completed', value: existing.value };
      if (existing.createdAt < times.staleBefore) {
        existing.createdAt = times.now;
        return { state: 'new' };
      }
      return { state: 'in_progress' };
    },
    async complete(id, value) {
      const entry = entries.get(id);
      if (entry) Object.assign(entry, { status: 'COMPLETED', value: structuredClone(value) });
    },
    async release(id) {
      if (entries.get(id)?.status === 'IN_PROGRESS') entries.delete(id);
    },
  };
}
