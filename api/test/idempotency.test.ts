import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  UpstreamUnavailableError,
} from '../src/application/errors.js';
import { createIdempotencyService, hashRequest } from '../src/application/idempotency-service.js';
import { buildTestApp } from './support/build-test-app.js';
import { fakeCountries, inMemoryIdempotencyStore } from './support/fakes.js';

describe('idempotency service', () => {
  const setup = (now = () => new Date('2026-11-20T12:00:00Z')) => {
    const store = inMemoryIdempotencyStore();
    return { store, service: createIdempotencyService({ store, now, staleAfterMs: 30_000 }) };
  };

  it('runs the operation once and replays its result for the same key and request', async () => {
    const { service } = setup();
    const operation = vi.fn().mockResolvedValue({ id: 'a1' });

    const first = await service.run('POST /x', 'key-1', { b: 1, a: 2 }, operation);
    const second = await service.run('POST /x', 'key-1', { a: 2, b: 1 }, operation); // key order differs

    expect(first).toEqual({ value: { id: 'a1' }, replayed: false });
    expect(second).toEqual({ value: { id: 'a1' }, replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rejects the same key with a different request', async () => {
    const { service } = setup();
    await service.run('POST /x', 'key-1', { a: 1 }, async () => 'ok');

    await expect(
      service.run('POST /x', 'key-1', { a: 2 }, async () => 'ok'),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('rejects a concurrent request while the first one is still running', async () => {
    const { service } = setup();
    let finish: (value: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => (finish = resolve));

    const first = service.run('POST /x', 'key-1', {}, () => slow);
    await expect(service.run('POST /x', 'key-1', {}, async () => 'twice')).rejects.toBeInstanceOf(
      IdempotencyInProgressError,
    );
    finish('once');
    await expect(first).resolves.toEqual({ value: 'once', replayed: false });
  });

  it('releases the key when the operation fails, so the client can retry with it', async () => {
    const { service } = setup();
    const failing = vi.fn().mockRejectedValue(new UpstreamUnavailableError('down'));

    await expect(service.run('POST /x', 'key-1', {}, failing)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    await expect(service.run('POST /x', 'key-1', {}, async () => 'retried')).resolves.toEqual({
      value: 'retried',
      replayed: false,
    });
  });

  it('takes over a claim abandoned for longer than the stale window', async () => {
    let clock = new Date('2026-11-20T12:00:00Z');
    const { store, service } = setup(() => clock);
    await store.begin('POST /x|key-1', hashRequest({}), {
      now: clock,
      expiresAt: clock,
      staleBefore: clock,
    }); // a crashed process left this IN_PROGRESS

    clock = new Date('2026-11-20T12:00:31Z');
    await expect(service.run('POST /x', 'key-1', {}, async () => 'recovered')).resolves.toEqual({
      value: 'recovered',
      replayed: false,
    });
  });

  it('keeps the same key independent across endpoints (scope)', async () => {
    const { service } = setup();
    await service.run('POST /a', 'key-1', { x: 1 }, async () => 'a');

    await expect(service.run('POST /b', 'key-1', { y: 2 }, async () => 'b')).resolves.toEqual({
      value: 'b',
      replayed: false,
    });
  });
});

describe('POST /validations with Idempotency-Key', () => {
  type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
  let ctx: TestApp | undefined;
  afterEach(async () => {
    await ctx?.app.close();
    ctx = undefined;
  });

  const body = { name: 'Ana Gómez', documentNumber: '1020304050' };
  const post = (app: TestApp['app'], payload: object, key?: string) =>
    app.inject({
      method: 'POST',
      url: '/validations',
      payload,
      headers: key ? { 'idempotency-key': key } : {},
    });

  it('a retry with the same key returns the same validation and writes nothing new', async () => {
    ctx = await buildTestApp();
    const { app, validations, audit } = ctx;

    const first = await post(app, body, 'b7f3c1e2-retry');
    // Same document written differently: the normalized body is what is compared.
    const retry = await post(app, { ...body, documentNumber: '1.020.304.050' }, 'b7f3c1e2-retry');

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(validations.items.size).toBe(1);
    expect(audit.events).toHaveLength(1);
  });

  it('a double click (two simultaneous requests) creates one validation', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    ctx = await buildTestApp({
      countries: fakeCountries(async (code) => {
        await gate; // keep the first request in flight
        return { code, name: 'Colombia', region: 'LAC', incomeLevel: 'UMC', capital: 'Bogota' };
      }),
    });
    const { app, validations } = ctx;

    const firstRequest = post(app, body, 'double-click');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await post(app, body, 'double-click');
    release();
    const first = await firstRequest;

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' } });
    expect(validations.items.size).toBe(1);
  });

  it('the same key with a different body is rejected with 422', async () => {
    ctx = await buildTestApp();
    await post(ctx.app, body, 'reused-key');

    const res = await post(ctx.app, { ...body, name: 'Carlos Ruiz' }, 'reused-key');

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('without a key every request creates a validation (the header is optional)', async () => {
    ctx = await buildTestApp();
    await post(ctx.app, body);
    await post(ctx.app, body);

    expect(ctx.validations.items.size).toBe(2);
  });

  it('a malformed key is a 400 and is not audited as a failed attempt of the person', async () => {
    ctx = await buildTestApp();

    const res = await post(ctx.app, body, 'x'.repeat(256));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(ctx.audit.events).toHaveLength(0);
  });
});
