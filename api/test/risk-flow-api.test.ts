import { afterEach, describe, expect, it } from 'vitest';
import { CountryNotFoundError, UpstreamUnavailableError } from '../src/shared/errors.js';
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
  const { app } = ctx;
  const post = async (payload: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: '/validations', payload });
    return {
      status: res.statusCode,
      body: res.json<{ verdict?: string; reasons?: { code: string }[] }>(),
    };
  };
  return { ...ctx, post };
}

describe('risk signals end to end (HTTP + audit trail)', () => {
  it('flags the same document under a different name for REVIEW, ignoring accents and case', async () => {
    const { post } = await setup();

    await post({ name: 'Ana Gómez', documentNumber: '1020304050' });
    const sameName = await post({ name: 'ANA GOMEZ', documentNumber: '1.020.304.050' });
    const otherName = await post({ name: 'Carlos Ruiz', documentNumber: '1020304050' });

    expect(sameName.body.verdict).toBe('APPROVED');
    expect(otherName.status).toBe(201);
    expect(otherName.body).toMatchObject({
      verdict: 'REVIEW',
      reasons: [{ code: 'DOCUMENT_NAME_MISMATCH' }],
    });
  });

  it('flags a phone shared by several people (GSI query) and blocks at three', async () => {
    const { post } = await setup();
    const phone = '+573009998877';

    await post({ name: 'Persona Uno', documentNumber: '11111111', phone });
    const second = await post({ name: 'Persona Dos', documentNumber: '22222222', phone });
    await post({ name: 'Persona Tres', documentNumber: '33333333', phone });
    const fourth = await post({ name: 'Persona Cuatro', documentNumber: '44444444', phone });

    expect(second.body).toMatchObject({ verdict: 'REVIEW', reasons: [{ code: 'SHARED_PHONE' }] });
    expect(fourth.body).toMatchObject({ verdict: 'BLOCKED', reasons: [{ code: 'SHARED_PHONE' }] });
  });

  it('audits invalid attempts that identify a document and blocks after three', async () => {
    const { post, audit } = await setup();

    for (let i = 0; i < 3; i++) {
      const res = await post({ name: 'X', documentNumber: '1020304050' }); // name too short
      expect(res.status).toBe(400);
    }
    const valid = await post({ name: 'Ana Gómez', documentNumber: '1020304050' });

    expect(audit.events.filter((e) => e.eventType === 'VALIDATION_FAILED')).toHaveLength(3);
    expect(valid.body).toMatchObject({
      verdict: 'BLOCKED',
      reasons: [{ code: 'REPEATED_FAILURES' }],
    });
  });

  it('does not audit attempts that do not identify a document', async () => {
    const { post, audit } = await setup();

    await post({ name: 'Ana', documentNumber: '12' });
    await post({ name: 'Ana' });

    expect(audit.events).toHaveLength(0);
  });

  it('counts an unknown country as a failed attempt, but not an upstream outage', async () => {
    let outage = false;
    const { post, audit } = await setup({
      countries: fakeCountries(async (code) => {
        if (outage) throw new UpstreamUnavailableError('down');
        if (code === 'ZZ') throw new CountryNotFoundError(code);
        return { code, name: 'Colombia', region: 'LAC', incomeLevel: 'UMC', capital: 'Bogota' };
      }),
    });

    expect(
      (await post({ name: 'Ana', documentNumber: '1020304050', countryCode: 'ZZ' })).status,
    ).toBe(422);
    outage = true;
    expect((await post({ name: 'Ana', documentNumber: '1020304050' })).status).toBe(502);

    expect(audit.events.map((e) => [e.eventType, e.detail])).toEqual([
      ['VALIDATION_FAILED', 'COUNTRY_NOT_FOUND'],
    ]);
  });
});

describe('GET /audit/:countryCode/:documentNumber', () => {
  it('returns the document timeline, oldest first, accepting formatted numbers', async () => {
    const { app, post } = await setup();
    await post({ name: 'X', documentNumber: '1020304050' });
    // The sort key has millisecond resolution; events inside the same millisecond are
    // concurrent and their order is undefined, so the test keeps them apart on purpose.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await post({ name: 'Ana Gómez', documentNumber: '1020304050' });

    const res = await app.inject({ method: 'GET', url: '/audit/co/1.020.304.050' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ documentKey: string; events: { eventType: string }[] }>();
    expect(body.documentKey).toBe('CO#1020304050');
    expect(body.events.map((e) => e.eventType)).toEqual([
      'VALIDATION_FAILED',
      'VALIDATION_CREATED',
    ]);
  });

  it('returns an empty timeline for an unknown document', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/audit/CO/99999999' });

    expect(res.json()).toEqual({ documentKey: 'CO#99999999', events: [] });
  });
});
