/**
 * Composition root: the only module that knows every layer. It builds the
 * infrastructure adapters (MongoDB, DynamoDB, World Bank API) and injects them
 * into the application services, which the presentation layer then exposes.
 */
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MongoClient, ObjectId } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { createAuditService } from './application/audit-service.js';
import { createDocumentService } from './application/document-service.js';
import { createValidationService } from './application/validation-service.js';
import type { Config } from './config.js';
import { createWorldBankCountriesClient } from './infrastructure/countries/world-bank-countries-client.js';
import {
  createDynamoAuditRepository,
  ensureAuditTable,
} from './infrastructure/persistence/dynamo-audit-repository.js';
import { createMongoDocumentRepository } from './infrastructure/persistence/mongo-document-repository.js';
import {
  createMongoValidationRepository,
  ensureValidationIndexes,
} from './infrastructure/persistence/mongo-validation-repository.js';
import type { AppDependencies } from './presentation/http/app.js';

export async function createContainer(config: Config, logger: FastifyBaseLogger) {
  // Infrastructure
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
  const validations = createMongoValidationRepository(db);
  const documents = createMongoDocumentRepository(db);
  const countries = createWorldBankCountriesClient({
    baseUrl: config.COUNTRIES_API_URL,
    timeoutMs: config.COUNTRIES_TIMEOUT_MS,
  });
  const newId = () => new ObjectId().toHexString();

  // Application
  const deps: AppDependencies = {
    validationService: createValidationService({ countries, validations, audit, logger, newId }),
    documentService: createDocumentService({ validations, documents, audit, logger, newId }),
    auditService: createAuditService({ audit }),
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
