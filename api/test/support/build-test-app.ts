import { buildApp } from '../../src/app.js';
import { createValidationService } from '../../src/validations/validation-service.js';
import { fakeCountries, inMemoryAudit, inMemoryValidations, silentLogger } from './fakes.js';

/** The real Fastify app with in-memory infrastructure. */
export async function buildTestApp(options: { countries?: ReturnType<typeof fakeCountries> } = {}) {
  const countries = options.countries ?? fakeCountries();
  const validations = inMemoryValidations();
  const audit = inMemoryAudit();
  const validationService = createValidationService({
    countries,
    validations,
    audit,
    logger: silentLogger,
  });
  const app = await buildApp({
    validationService,
    corsOrigin: '*',
    healthCheck: async () => ({ mongo: true, dynamo: true }),
  });
  return { app, countries, validations, audit };
}
