import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { IdempotencyService } from '../../../application/idempotency-service.js';
import type { ValidationService } from '../../../application/validation-service.js';
import type { ValidationRecord } from '../../../domain/validation.js';
import {
  createValidationBodySchema,
  createValidationResponseSchema,
  errorResponseSchema,
  failedAttemptSchema,
  idempotencyHeadersSchema,
  objectIdSchema,
  validationResponseSchema,
} from '../schemas.js';

export interface ValidationRoutesOptions {
  service: ValidationService;
  idempotency: IdempotencyService;
}

export const validationRoutes: FastifyPluginAsyncZod<ValidationRoutesOptions> = async (
  app,
  { service, idempotency },
) => {
  app.post(
    '/validations',
    {
      // Validation errors are handled in the handler so failed attempts can be audited.
      attachValidation: true,
      schema: {
        tags: ['validations'],
        summary: 'Validate a person, enrich the record with country data and store it',
        description:
          'Send an Idempotency-Key header (e.g. a UUID) to make retries safe: the same key and body return the first response (Idempotent-Replayed: true) instead of creating another validation.',
        headers: idempotencyHeadersSchema,
        body: createValidationBodySchema,
        response: {
          201: createValidationResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
          504: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        // An invalid body that still identifies a document counts as a failed attempt
        // (a malformed header is the client's bug, not the person's).
        if (request.validationError.validationContext === 'body') {
          const identity = failedAttemptSchema.safeParse(request.body);
          if (identity.success)
            await service.recordFailedAttempt(identity.data, 'VALIDATION_ERROR');
        }
        throw request.validationError;
      }

      const create = async () => {
        const record = await service.create(request.body);
        return { id: record.id, ...record.risk };
      };
      const key = request.headers['idempotency-key'];
      if (!key) return reply.code(201).send(await create());

      // The normalized body is hashed, so "1.020.304.050" and "1020304050" are the same request.
      const { value, replayed } = await idempotency.run(
        'POST /validations',
        key,
        request.body,
        create,
      );
      if (replayed) reply.header('idempotent-replayed', 'true');
      return reply.code(201).send(value);
    },
  );

  app.get(
    '/validations/:id',
    {
      schema: {
        tags: ['validations'],
        summary: 'Get a stored validation',
        params: z.object({ id: objectIdSchema }),
        response: {
          200: validationResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => toResponse(await service.getById(request.params.id)),
  );
};

function toResponse(record: ValidationRecord) {
  return {
    id: record.id,
    name: record.name,
    documentNumber: record.documentNumber,
    countryCode: record.countryCode,
    phone: record.phone,
    country: record.country,
    risk: record.risk,
    createdAt: record.createdAt.toISOString(),
  };
}
