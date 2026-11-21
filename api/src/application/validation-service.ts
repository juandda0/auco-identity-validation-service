import { documentKeyOf } from '../domain/audit-event.js';
import type { CountryInfo } from '../domain/country.js';
import { normalizeName } from '../domain/normalize.js';
import { assessRisk } from '../domain/risk-engine.js';
import type { ValidationRecord } from '../domain/validation.js';
import { AuditUnavailableError, CountryNotFoundError, NotFoundError } from './errors.js';
import type { AuditRepository, CountriesClient, Logger, ValidationRepository } from './ports.js';

/** Already validated and normalized by the presentation layer. */
export interface CreateValidationInput {
  name: string;
  documentNumber: string;
  countryCode: string;
  phone?: string | undefined;
}

/** Identifies a document even when the rest of the request was invalid. */
export interface DocumentIdentity {
  countryCode: string;
  documentNumber: string;
}

export interface ValidationServiceDeps {
  countries: CountriesClient;
  validations: ValidationRepository;
  audit: AuditRepository;
  logger: Logger;
  /** Generates record ids (the composition root uses MongoDB ObjectIds). */
  newId: () => string;
  now?: () => Date;
}

export type ValidationService = ReturnType<typeof createValidationService>;

export function createValidationService(deps: ValidationServiceDeps) {
  const { countries, validations, audit, logger, newId } = deps;
  const now = deps.now ?? (() => new Date());

  /** Best effort: a failed attempt that cannot be audited must not hide the original error. */
  async function recordFailedAttempt(identity: DocumentIdentity, reason: string): Promise<void> {
    try {
      await audit.append({ eventType: 'VALIDATION_FAILED', ...identity, detail: reason });
    } catch (error) {
      logger.warn({ err: error, ...identity }, 'Could not audit failed attempt');
    }
  }

  return {
    recordFailedAttempt,

    async create(input: CreateValidationInput): Promise<ValidationRecord> {
      const documentKey = documentKeyOf(input.countryCode, input.documentNumber);

      // 1. Enrich. An unknown country is the person's mistake, so it counts as a
      //    failed attempt; an upstream outage is ours, so it does not.
      let country: CountryInfo;
      try {
        country = await countries.getByCode(input.countryCode);
      } catch (error) {
        if (error instanceof CountryNotFoundError) {
          await recordFailedAttempt(input, error.code);
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
      //    the audit write fails the insert is compensated (deleted).
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

    async getById(id: string): Promise<ValidationRecord> {
      const record = await validations.findById(id);
      if (!record) throw new NotFoundError('Validation', id);
      return record;
    },
  };
}
