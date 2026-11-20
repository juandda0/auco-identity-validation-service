import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ValidationService } from './validation-service.js';
import type { ValidationRecord } from './validation.js';
import {
  createValidationBodySchema,
  createValidationResponseSchema,
  errorResponseSchema,
  objectIdSchema,
  validationResponseSchema,
} from './schemas.js';

export interface ValidationRoutesOptions {
  service: ValidationService;
}

export const validationRoutes: FastifyPluginAsyncZod<ValidationRoutesOptions> = async (
  app,
  { service },
) => {
  app.post(
    '/validations',
    {
      // Validation errors are handled in the handler so failed attempts can be audited.
      attachValidation: true,
      schema: {
        tags: ['validations'],
        summary: 'Validate a person, enrich the record with country data and store it',
        body: createValidationBodySchema,
        response: {
          201: createValidationResponseSchema,
          400: errorResponseSchema,
          422: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
          504: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        await service.recordInvalidAttempt(request.body);
        throw request.validationError;
      }
      const record = await service.create(request.body);
      return reply.code(201).send({ id: record.id, ...record.risk });
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
