import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorHandler } from './shared/error-handler.js';
import type { AuditRepository } from './audit/audit-event.js';
import { auditRoutes } from './audit/audit-routes.js';
import type { ValidationService } from './validations/validation-service.js';
import { validationRoutes } from './validations/validation-routes.js';

export interface AppDependencies {
  validationService: ValidationService;
  audit: AuditRepository;
  /** Returns true when MongoDB and DynamoDB answer. */
  healthCheck: () => Promise<{ mongo: boolean; dynamo: boolean }>;
  corsOrigin: string;
}

/**
 * Builds the HTTP adapter. All I/O comes in through `deps`, so tests inject
 * in-memory fakes and the same app can run behind a Lambda handler.
 */
export async function buildApp(deps: AppDependencies, logger?: FastifyBaseLogger) {
  const app = Fastify({
    ...(logger ? { loggerInstance: logger } : { logger: false }),
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `${request.method} ${request.url} does not exist`,
      },
    }),
  );
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(cors, { origin: deps.corsOrigin });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AUCO identity validation service',
        description:
          'Validates people, enriches records with World Bank country data, stores them in MongoDB and keeps an append-only audit trail in DynamoDB.',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        response: {
          200: z.object({ status: z.literal('ok'), mongo: z.boolean(), dynamo: z.boolean() }),
          503: z.object({ status: z.literal('degraded'), mongo: z.boolean(), dynamo: z.boolean() }),
        },
      },
    },
    async (_request, reply) => {
      const result = await deps.healthCheck();
      return result.mongo && result.dynamo
        ? reply.code(200).send({ status: 'ok', ...result })
        : reply.code(503).send({ status: 'degraded', ...result });
    },
  );

  await app.register(validationRoutes, { service: deps.validationService });
  await app.register(auditRoutes, { audit: deps.audit });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
