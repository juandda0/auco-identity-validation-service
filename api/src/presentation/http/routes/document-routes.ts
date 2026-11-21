import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { DocumentService } from '../../../application/document-service.js';
import type { DocumentRecord } from '../../../domain/document.js';
import { errorResponseSchema, objectIdSchema } from '../schemas.js';

/** Today's date (YYYY-MM-DD) in Colombia; a UTC date would already be "tomorrow" after 19:00. */
function todayInColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** 19.99 * 100 is 1998.9999999999998 in floating point, so compare with a tolerance. */
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export const promissoryNoteBodySchema = z.object({
  amount: z
    .number()
    .positive()
    .max(1_000_000_000_000)
    .refine(hasAtMostTwoDecimals, 'must have at most 2 decimals'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code such as COP')
    .refine(isSupportedCurrency, 'unknown currency')
    .default('COP'),
  dueDate: z.iso.date().refine((d) => d > todayInColombia(), {
    message: 'must be a future date (Colombia time)',
  }),
  creditorName: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(60).optional(),
});

const documentResponseSchema = z.object({
  id: z.string(),
  validationId: z.string(),
  type: z.literal('PROMISSORY_NOTE'),
  status: z.enum(['PENDING_SIGNATURE', 'SIGNED']),
  fields: z.object({
    amount: z.number(),
    currency: z.string(),
    dueDate: z.string(),
    creditorName: z.string(),
    city: z.string(),
  }),
  content: z.string(),
  contentHash: z.string(),
  signature: z
    .object({
      signedAt: z.string(),
      ip: z.string(),
      userAgent: z.string().nullable(),
      elapsedMs: z.number(),
    })
    .nullable(),
  createdAt: z.string(),
});

export const documentRoutes: FastifyPluginAsyncZod<{ service: DocumentService }> = async (
  app,
  { service },
) => {
  app.post(
    '/validations/:id/promissory-notes',
    {
      schema: {
        tags: ['documents'],
        summary: 'Generate a demo promissory note for an APPROVED validation',
        params: z.object({ id: objectIdSchema }),
        body: promissoryNoteBodySchema,
        response: {
          201: documentResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const document = await service.createPromissoryNote(request.params.id, request.body);
      return reply.code(201).send(toResponse(document));
    },
  );

  app.get(
    '/documents/:id',
    {
      schema: {
        tags: ['documents'],
        summary: 'Get a document with its hash and signature',
        params: z.object({ id: objectIdSchema }),
        response: {
          200: documentResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => toResponse(await service.getById(request.params.id)),
  );

  app.post(
    '/documents/:id/sign',
    {
      schema: {
        tags: ['documents'],
        summary: 'Sign a document (records time, IP and user agent; verifies the content hash)',
        params: z.object({ id: objectIdSchema }),
        response: {
          200: documentResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request) =>
      toResponse(
        await service.sign(request.params.id, {
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        }),
      ),
  );
};

function toResponse(document: DocumentRecord) {
  return {
    ...document,
    signature: document.signature && {
      ...document.signature,
      signedAt: document.signature.signedAt.toISOString(),
    },
    createdAt: document.createdAt.toISOString(),
  };
}

function isSupportedCurrency(code: string): boolean {
  return Intl.supportedValuesOf('currency').includes(code);
}
