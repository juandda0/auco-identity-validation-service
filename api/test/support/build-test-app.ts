import { buildApp } from '../../src/app.js';
import { createDocumentService } from '../../src/documents/document-service.js';
import { createValidationService } from '../../src/validations/validation-service.js';
import {
  fakeCountries,
  inMemoryAudit,
  inMemoryDocuments,
  inMemoryValidations,
  silentLogger,
} from './fakes.js';

/** The real Fastify app with in-memory infrastructure. */
export async function buildTestApp(options: { countries?: ReturnType<typeof fakeCountries> } = {}) {
  const countries = options.countries ?? fakeCountries();
  const validations = inMemoryValidations();
  const documents = inMemoryDocuments();
  const audit = inMemoryAudit();
  const logger = silentLogger;
  const app = await buildApp({
    validationService: createValidationService({ countries, validations, audit, logger }),
    documentService: createDocumentService({ validations, documents, audit, logger }),
    audit,
    corsOrigin: '*',
    healthCheck: async () => ({ mongo: true, dynamo: true }),
  });
  return { app, countries, validations, documents, audit };
}
