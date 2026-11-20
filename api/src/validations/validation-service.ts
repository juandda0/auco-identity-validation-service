import { ObjectId } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { CountriesClient } from '../clients/countries.js';
import type { AuditRepository } from '../audit/audit-event.js';
import { AuditUnavailableError, NotFoundError } from '../shared/errors.js';
import { normalizeName } from '../shared/normalize.js';
import type { CreateValidationInput } from './schemas.js';
import type { ValidationRecord, ValidationRepository } from './validation.js';

export interface ValidationServiceDeps {
  countries: CountriesClient;
  validations: ValidationRepository;
  audit: AuditRepository;
  logger: Pick<FastifyBaseLogger, 'error' | 'warn'>;
  newId?: () => string;
  now?: () => Date;
}

export type ValidationService = ReturnType<typeof createValidationService>;

export function createValidationService(deps: ValidationServiceDeps) {
  const { countries, validations, audit, logger } = deps;
  const newId = deps.newId ?? (() => new ObjectId().toHexString());
  const now = deps.now ?? (() => new Date());

  return {
    async create(input: CreateValidationInput): Promise<ValidationRecord> {
      // 1. Enrich. Countries errors (422 / 502 / 504) propagate to the error handler.
      const country = await countries.getByCode(input.countryCode);

      // 2. Persist. The id is generated here so it can also go into the audit event.
      const record: ValidationRecord = {
        id: newId(),
        name: input.name,
        normalizedName: normalizeName(input.name),
        documentNumber: input.documentNumber,
        countryCode: input.countryCode,
        phone: input.phone ?? null,
        country,
        createdAt: now(),
      };
      await validations.insert(record);

      // 3. Audit. A validation without its audit event must not exist, so if
      //    DynamoDB fails the MongoDB insert is compensated (deleted).
      try {
        await audit.append({
          eventType: 'VALIDATION_CREATED',
          occurredAt: record.createdAt,
          countryCode: record.countryCode,
          documentNumber: record.documentNumber,
          validationId: record.id,
          name: record.name,
          normalizedName: record.normalizedName,
          phone: record.phone ?? undefined,
        });
      } catch (error) {
        await validations.deleteById(record.id).catch((cleanupError: unknown) => {
          logger.error(
            { err: cleanupError, validationId: record.id },
            'Compensation failed: validation stored without audit event',
          );
        });
        throw new AuditUnavailableError(
          'Audit trail is unavailable, the validation was not stored',
          {
            cause: error,
          },
        );
      }

      return record;
    },

    async getById(id: string): Promise<ValidationRecord> {
      const record = await validations.findById(id);
      if (!record) throw new NotFoundError('Validation', id);
      return record;
    },
  };
}
