import { randomUUID } from 'node:crypto';
import type { CountriesClient, CountryInfo } from '../../src/clients/countries.js';
import {
  documentKeyOf,
  sortKeyOf,
  type AuditEvent,
  type AuditRepository,
} from '../../src/audit/audit-event.js';
import type { DocumentRecord, DocumentRepository } from '../../src/documents/document.js';
import type { ValidationRecord, ValidationRepository } from '../../src/validations/validation.js';

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
