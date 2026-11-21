/**
 * AWS Lambda entry point (not deployed in this exercise).
 * The same Fastify app runs behind API Gateway through @fastify/aws-lambda;
 * connections are created once per container and reused across invocations.
 */
import awsLambdaFastify from '@fastify/aws-lambda';
import pino from 'pino';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { buildApp } from './presentation/http/app.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const container = await createContainer(config, logger);
const app = await buildApp(container.deps, logger);
const proxy = awsLambdaFastify(app);
await app.ready();

export const handler = (event: APIGatewayProxyEvent, context: Context) => proxy(event, context);
