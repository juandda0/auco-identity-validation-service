import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MongoClient } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { AppDependencies } from './app.js';
import { createCountriesClient } from './clients/countries.js';
import { createDynamoAuditRepository, ensureAuditTable } from './audit/dynamo-audit-repository.js';
import {
  createMongoValidationRepository,
  ensureValidationIndexes,
} from './validations/mongo-validation-repository.js';
import { createValidationService } from './validations/validation-service.js';
import { createDocumentService } from './documents/document-service.js';
import { createMongoDocumentRepository } from './documents/mongo-document-repository.js';

/** Wires real infrastructure (MongoDB, DynamoDB, World Bank API) into the app. */
export async function createContainer(config: Config, logger: FastifyBaseLogger) {
  const mongo = new MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await mongo.connect();
  const db = mongo.db(config.MONGO_DB);

  const dynamo = new DynamoDBClient({
    region: config.DYNAMO_REGION,
    ...(config.DYNAMO_ENDPOINT && {
      endpoint: config.DYNAMO_ENDPOINT,
      // DynamoDB Local accepts any credentials; real AWS uses the default provider chain.
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    }),
  });

  await retry(() => ensureAuditTable(dynamo, config.DYNAMO_TABLE), logger, 'DynamoDB');
  await ensureValidationIndexes(db);

  const audit = createDynamoAuditRepository(dynamo, config.DYNAMO_TABLE);
  const countries = createCountriesClient({
    baseUrl: config.COUNTRIES_API_URL,
    timeoutMs: config.COUNTRIES_TIMEOUT_MS,
  });
  const validations = createMongoValidationRepository(db);
  const validationService = createValidationService({ countries, validations, audit, logger });
  const documentService = createDocumentService({
    validations,
    documents: createMongoDocumentRepository(db),
    audit,
    logger,
  });

  const deps: AppDependencies = {
    validationService,
    documentService,
    audit,
    corsOrigin: config.CORS_ORIGIN,
    healthCheck: async () => {
      const [mongoOk, dynamoOk] = await Promise.all([
        db.command({ ping: 1 }).then(
          () => true,
          () => false,
        ),
        // The table itself, not just the connection: without it every write fails.
        dynamo.send(new DescribeTableCommand({ TableName: config.DYNAMO_TABLE })).then(
          () => true,
          () => false,
        ),
      ]);
      return { mongo: mongoOk, dynamo: dynamoOk };
    },
  };

  return {
    deps,
    async close() {
      await mongo.close();
      dynamo.destroy();
    },
  };
}

/** DynamoDB Local takes a few seconds to accept connections after `docker compose up`. */
async function retry(
  fn: () => Promise<void>,
  logger: FastifyBaseLogger,
  name: string,
  attempts = 10,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      logger.warn({ attempt, err: error }, `${name} not ready yet, retrying`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
