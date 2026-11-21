import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import {
  AppError,
  AuditUnavailableError,
  ConflictError,
  CountryNotFoundError,
  IdempotencyKeyReusedError,
  NotFoundError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../../application/errors.js';

interface ErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

/** The only place that knows how application errors become HTTP status codes. */
export function httpStatusOf(error: Error): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  if (error instanceof CountryNotFoundError) return 422;
  if (error instanceof IdempotencyKeyReusedError) return 422;
  if (error instanceof UpstreamUnavailableError) return 502;
  if (error instanceof AuditUnavailableError) return 503;
  if (error instanceof UpstreamTimeoutError) return 504;
  return 500;
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
    const status = httpStatusOf(error);
    if (status >= 500) {
      request.log.warn({ err: error, cause: error.cause }, error.message);
    }
    return reply
      .code(status)
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
