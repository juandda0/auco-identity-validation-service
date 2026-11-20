import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AuditUnavailableError } from '../shared/errors.js';
import {
  countryCodeSchema,
  documentNumberSchema,
  errorResponseSchema,
} from '../validations/schemas.js';
import { documentKeyOf, type AuditRepository } from './audit-event.js';

const auditEventSchema = z.object({
  eventId: z.string(),
  eventType: z.enum([
    'VALIDATION_CREATED',
    'VALIDATION_FAILED',
    'DOCUMENT_GENERATED',
    'DOCUMENT_SIGNED',
  ]),
  occurredAt: z.string(),
  validationId: z.string().optional(),
  documentId: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  verdict: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  contentHash: z.string().optional(),
  ip: z.string().optional(),
  detail: z.string().optional(),
});

export const auditRoutes: FastifyPluginAsyncZod<{ audit: AuditRepository }> = async (
  app,
  { audit },
) => {
  app.get(
    '/audit/:countryCode/:documentNumber',
    {
      schema: {
        tags: ['audit'],
        summary: 'Timeline of every audit event of a document, oldest first',
        params: z.object({ countryCode: countryCodeSchema, documentNumber: documentNumberSchema }),
        response: {
          200: z.object({ documentKey: z.string(), events: z.array(auditEventSchema) }),
          400: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const documentKey = documentKeyOf(request.params.countryCode, request.params.documentNumber);
      const events = await audit.listByDocument(documentKey).catch((error: unknown) => {
        throw new AuditUnavailableError('Audit history is unavailable', { cause: error });
      });
      return { documentKey, events };
    },
  );
};
