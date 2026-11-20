import { ObjectId } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { CountriesClient } from '../clients/countries.js';
import { documentKeyOf, type AuditRepository } from '../audit/audit-event.js';
import { assessRisk } from '../risk/risk-engine.js';
import { AuditUnavailableError, CountryNotFoundError, NotFoundError } from '../shared/errors.js';
import { normalizeName } from '../shared/normalize.js';
import { failedAttemptSchema, type CreateValidationInput } from './schemas.js';
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

  /** Best effort: a failed attempt that cannot be audited must not hide the original error. */
  async function auditFailure(countryCode: string, documentNumber: string, detail: string) {
    try {
      await audit.append({ eventType: 'VALIDATION_FAILED', countryCode, documentNumber, detail });
    } catch (error) {
      logger.warn({ err: error, countryCode, documentNumber }, 'Could not audit failed attempt');
    }
  }

  return {
    async create(input: CreateValidationInput): Promise<ValidationRecord> {
      const documentKey = documentKeyOf(input.countryCode, input.documentNumber);

      // 1. Enrich. Countries errors (422 / 502 / 504) propagate to the error handler.
      //    An unknown country is the person's mistake, so it counts as a failed attempt;
      //    an upstream outage is ours, so it does not.
      let country;
      try {
        country = await countries.getByCode(input.countryCode);
      } catch (error) {
        if (error instanceof CountryNotFoundError) {
          await auditFailure(input.countryCode, input.documentNumber, error.code);
        }
        throw error;
      }

      // 2. Risk: the person's history is one PK query, the phone's history one GSI query.
      const normalizedName = normalizeName(input.name);
      const [documentHistory, phoneHistory] = await Promise.all([
        audit.listByDocument(documentKey),
        input.phone ? audit.listByPhone(input.phone) : Promise.resolve([]),
      ]).catch((error: unknown) => {
        throw new AuditUnavailableError('Audit history is unavailable', { cause: error });
      });
      const createdAt = now();
      const risk = assessRisk({
        documentKey,
        normalizedName,
        phone: input.phone ?? null,
        documentHistory,
        phoneHistory,
        now: createdAt,
      });

      // 3. Persist. The id is generated here so it can also go into the audit event.
      const record: ValidationRecord = {
        id: newId(),
        name: input.name,
        normalizedName,
        documentNumber: input.documentNumber,
        countryCode: input.countryCode,
        phone: input.phone ?? null,
        country,
        risk,
        createdAt,
      };
      await validations.insert(record);

      // 4. Audit. A validation without its audit event must not exist, so if
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
          verdict: risk.verdict,
          reasons: risk.reasons.map((reason) => reason.code),
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
          { cause: error },
        );
      }

      return record;
    },

    /**
     * Called when the request body is invalid. If it still identifies a
     * document, the attempt is audited so repeated failures can be detected.
     */
    async recordInvalidAttempt(rawBody: unknown): Promise<void> {
      const parsed = failedAttemptSchema.safeParse(rawBody);
      if (!parsed.success) return;
      await auditFailure(parsed.data.countryCode, parsed.data.documentNumber, 'VALIDATION_ERROR');
    },

    async getById(id: string): Promise<ValidationRecord> {
      const record = await validations.findById(id);
      if (!record) throw new NotFoundError('Validation', id);
      return record;
    },
  };
}
