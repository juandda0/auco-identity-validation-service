import { afterEach, describe, expect, it } from 'vitest';
import {
  type AppError,
  CountryNotFoundError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../src/shared/errors.js';
import { buildTestApp } from './support/build-test-app.js';
import { fakeCountries } from './support/fakes.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
let ctx: TestApp | undefined;

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

async function setup(options: Parameters<typeof buildTestApp>[0] = {}) {
  ctx = await buildTestApp(options);
  return ctx;
}

const validBody = { name: 'Ana Gómez', documentNumber: '1020304050', phone: '+573001234567' };

describe('POST /validations', () => {
  it('enriches, stores in MongoDB, writes the audit event and returns the id', async () => {
    const { app, validations, audit, countries } = await setup();

    const res = await app.inject({ method: 'POST', url: '/validations', payload: validBody });

    expect(res.statusCode).toBe(201);
    const { id, verdict, reasons } = res.json<{ id: string; verdict: string; reasons: [] }>();
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect({ verdict, reasons }).toEqual({ verdict: 'APPROVED', reasons: [] });
    expect(countries.calls).toEqual(['CO']);
    expect(validations.items.get(id)).toMatchObject({
      documentNumber: '1020304050',
      countryCode: 'CO',
      country: { name: 'Colombia' },
    });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      eventType: 'VALIDATION_CREATED',
      documentKey: 'CO#1020304050',
      validationId: id,
      phone: '+573001234567',
    });
    expect(audit.events[0]?.sk).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z#[0-9a-f-]{36}$/);
  });

  it('returns 400 with field details and stores nothing when the input is invalid', async () => {
    const { app, validations, audit } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/validations',
      payload: { name: 'A', documentNumber: '12' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; details: { path: string }[] } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d) => d.path)).toEqual(['body.name', 'body.documentNumber']);
    expect(validations.items.size).toBe(0);
    expect(audit.events).toHaveLength(0);
  });

  it.each<[string, AppError, number, string]>([
    ['unknown country', new CountryNotFoundError('ZZ'), 422, 'COUNTRY_NOT_FOUND'],
    ['API down', new UpstreamUnavailableError('down'), 502, 'UPSTREAM_UNAVAILABLE'],
    ['API timeout', new UpstreamTimeoutError('slow'), 504, 'UPSTREAM_TIMEOUT'],
  ])('maps %s to %i and stores nothing', async (_label, error, status, code) => {
    const { app, validations } = await setup({
      countries: fakeCountries(async () => {
        throw error;
      }),
    });

    const res = await app.inject({ method: 'POST', url: '/validations', payload: validBody });

    expect(res.statusCode).toBe(status);
    expect(res.json()).toMatchObject({ error: { code } });
    expect(validations.items.size).toBe(0);
  });

  it('rolls back the MongoDB insert and returns 503 when the audit trail cannot be written', async () => {
    const { app, validations, audit } = await setup();
    audit.failNextAppend = true;

    const res = await app.inject({ method: 'POST', url: '/validations', payload: validBody });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'AUDIT_UNAVAILABLE' } });
    expect(validations.items.size).toBe(0);
  });

  it('returns 400 for malformed JSON', async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/validations',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /validations/:id', () => {
  it('returns the stored record', async () => {
    const { app } = await setup();
    const created = await app.inject({ method: 'POST', url: '/validations', payload: validBody });
    const { id } = created.json<{ id: string }>();

    const res = await app.inject({ method: 'GET', url: `/validations/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id,
      name: 'Ana Gómez',
      documentNumber: '1020304050',
      countryCode: 'CO',
      phone: '+573001234567',
      country: {
        code: 'CO',
        name: 'Colombia',
        region: 'Latin America & Caribbean',
        incomeLevel: 'Upper middle income',
        capital: 'Bogota',
      },
      risk: { verdict: 'APPROVED', reasons: [] },
      createdAt: expect.stringMatching(/Z$/) as string,
    });
  });

  it('returns 400 for an invalid id and 404 for a missing one', async () => {
    const { app } = await setup();

    const invalid = await app.inject({ method: 'GET', url: '/validations/not-an-id' });
    const missing = await app.inject({
      method: 'GET',
      url: '/validations/0123456789abcdef01234567',
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('cross-cutting', () => {
  it('echoes a request id and answers unknown routes with the same error shape', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
  });
});
