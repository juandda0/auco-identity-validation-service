import { documentKeyOf, type AuditEvent } from '../domain/audit-event.js';
import { AuditUnavailableError } from './errors.js';
import type { AuditRepository } from './ports.js';

export type AuditService = ReturnType<typeof createAuditService>;

export function createAuditService(deps: { audit: AuditRepository }) {
  return {
    /** Every audit event of a document, oldest first (one partition-key query). */
    async timeline(
      countryCode: string,
      documentNumber: string,
    ): Promise<{ documentKey: string; events: AuditEvent[] }> {
      const documentKey = documentKeyOf(countryCode, documentNumber);
      const events = await deps.audit.listByDocument(documentKey).catch((error: unknown) => {
        throw new AuditUnavailableError('Audit history is unavailable', { cause: error });
      });
      return { documentKey, events };
    },
  };
}
