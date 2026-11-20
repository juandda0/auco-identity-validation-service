import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from './errors.js';

interface ErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

/** Single place where errors become HTTP responses with one consistent shape. */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const body: ErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation.map((issue) => ({
          path: `${error.validationContext ?? 'request'}${issue.instancePath.replaceAll('/', '.')}`,
          message: issue.message ?? 'Invalid value',
        })),
      },
    };
    return reply.code(400).send(body);
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.warn({ err: error, cause: error.cause }, error.message);
    }
    return reply
      .code(error.statusCode)
      .send({ error: { code: error.code, message: error.message } } satisfies ErrorBody);
  }

  // Fastify's own client errors (malformed JSON, wrong content type, body too large...).
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ error: { code: error.code, message: error.message } } satisfies ErrorBody);
  }

  request.log.error({ err: error }, 'Unhandled error');
  return reply
    .code(500)
    .send({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } } satisfies ErrorBody);
}
