import { createAuditService } from '../../src/application/audit-service.js';
import { createDocumentService } from '../../src/application/document-service.js';
import { createValidationService } from '../../src/application/validation-service.js';
import { buildApp } from '../../src/presentation/http/app.js';
import {
  fakeCountries,
  inMemoryAudit,
  inMemoryDocuments,
  inMemoryValidations,
  newTestId,
  silentLogger,
} from './fakes.js';

/** The real Fastify app with in-memory infrastructure. */
export async function buildTestApp(options: { countries?: ReturnType<typeof fakeCountries> } = {}) {
  const countries = options.countries ?? fakeCountries();
  const validations = inMemoryValidations();
  const documents = inMemoryDocuments();
  const audit = inMemoryAudit();
  const logger = silentLogger;
  const newId = newTestId;
  const app = await buildApp({
    validationService: createValidationService({ countries, validations, audit, logger, newId }),
    documentService: createDocumentService({ validations, documents, audit, logger, newId }),
    auditService: createAuditService({ audit }),
    corsOrigin: '*',
    healthCheck: async () => ({ mongo: true, dynamo: true }),
  });
  return { app, countries, validations, documents, audit };
}
