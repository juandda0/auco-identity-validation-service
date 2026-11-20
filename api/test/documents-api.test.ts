import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPromissoryNote, sha256 } from '../src/documents/promissory-note.js';
import { buildTestApp } from './support/build-test-app.js';
import { COLOMBIA } from './support/fakes.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
let ctx: TestApp | undefined;

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

interface DocumentBody {
  id: string;
  status: string;
  content: string;
  contentHash: string;
  fields: { city: string; currency: string };
  signature: { ip: string; userAgent: string | null; elapsedMs: number } | null;
}

const note = { amount: 1_500_000, dueDate: '2099-12-31', creditorName: 'Banco Demo S.A.' };

async function setup() {
  ctx = await buildTestApp();
  const { app } = ctx;
  const validate = async (body: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: '/validations', payload: body });
    return res.json<{ id: string; verdict: string }>();
  };
  const generate = (validationId: string, body: Record<string, unknown> = note) =>
    app.inject({
      method: 'POST',
      url: `/validations/${validationId}/promissory-notes`,
      payload: body,
    });
  const sign = (documentId: string) =>
    app.inject({
      method: 'POST',
      url: `/documents/${documentId}/sign`,
      headers: { 'user-agent': 'vitest' },
    });
  return { ...ctx, validate, generate, sign };
}

describe('promissory note template', () => {
  it('renders the validated identity and the note fields, and hashes deterministically', () => {
    const fields = { ...note, currency: 'COP', city: 'Medellín' };
    const content = renderPromissoryNote(
      { name: 'Ana Gómez', documentNumber: '1020304050', country: COLOMBIA },
      fields,
      new Date('2026-11-20T12:00:00Z'),
    );

    expect(content).toContain('DOCUMENTO DE DEMOSTRACIÓN - SIN VALIDEZ LEGAL');
    expect(content).toContain(
      'Yo, Ana Gómez, identificado(a) con documento No. 1020304050 de Colombia',
    );
    expect(content).toContain('a la orden de Banco Demo S.A.');
    expect(content).toMatch(/1\.500\.000/);
    expect(sha256(content)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(content)).toBe(sha256(content));
    expect(sha256(`${content} `)).not.toBe(sha256(content));
  });
});

describe('POST /validations/:id/promissory-notes', () => {
  it('generates a note for an APPROVED validation and records its hash in the audit trail', async () => {
    const { validate, generate, audit } = await setup();
    const { id } = await validate({ name: 'Ana Gómez', documentNumber: '1020304050' });

    const res = await generate(id);

    expect(res.statusCode).toBe(201);
    const body = res.json<DocumentBody>();
    expect(body).toMatchObject({
      status: 'PENDING_SIGNATURE',
      signature: null,
      // Defaults: COP and the capital returned by the countries API.
      fields: { currency: 'COP', city: 'Bogota' },
    });
    expect(body.contentHash).toBe(sha256(body.content));
    expect(audit.events.at(-1)).toMatchObject({
      eventType: 'DOCUMENT_GENERATED',
      documentId: body.id,
      contentHash: body.contentHash,
    });
  });

  it('refuses validations that are not APPROVED with 409', async () => {
    const { validate, generate } = await setup();
    await validate({ name: 'Ana Gómez', documentNumber: '1020304050' });
    const review = await validate({ name: 'Carlos Ruiz', documentNumber: '1020304050' });
    expect(review.verdict).toBe('REVIEW');

    const res = await generate(review.id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_NOT_APPROVED' } });
  });

  it('validates the body and returns 404 for an unknown validation', async () => {
    const { validate, generate } = await setup();
    const { id } = await validate({ name: 'Ana Gómez', documentNumber: '1020304050' });

    const past = await generate(id, { ...note, dueDate: '2020-01-01' });
    const badCurrency = await generate(id, { ...note, currency: 'XYZ' });
    const decimals = await generate(id, { ...note, amount: 10.123 });
    const missing = await generate('0123456789abcdef01234567');

    expect([past.statusCode, badCurrency.statusCode, decimals.statusCode]).toEqual([400, 400, 400]);
    expect(missing.statusCode).toBe(404);
  });
});

describe('POST /documents/:id/sign', () => {
  async function pendingDocument() {
    const helpers = await setup();
    const { id } = await helpers.validate({ name: 'Ana Gómez', documentNumber: '1020304050' });
    const document = (await helpers.generate(id)).json<DocumentBody>();
    return { ...helpers, document };
  }

  it('signs, records IP, user agent and elapsed time, and audits the signature', async () => {
    const { sign, document, audit, app } = await pendingDocument();

    const res = await sign(document.id);

    expect(res.statusCode).toBe(200);
    const body = res.json<DocumentBody>();
    expect(body.status).toBe('SIGNED');
    expect(body.signature).toMatchObject({ ip: '127.0.0.1', userAgent: 'vitest' });
    expect(body.signature?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(audit.events.map((e) => e.eventType)).toEqual([
      'VALIDATION_CREATED',
      'DOCUMENT_GENERATED',
      'DOCUMENT_SIGNED',
    ]);

    const stored = await app.inject({ method: 'GET', url: `/documents/${document.id}` });
    expect(stored.json<DocumentBody>().status).toBe('SIGNED');
  });

  it('refuses to sign twice', async () => {
    const { sign, document } = await pendingDocument();

    await sign(document.id);
    const second = await sign(document.id);

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'ALREADY_SIGNED' } });
  });

  it('refuses to sign a document edited after it was generated (hash check against the audit trail)', async () => {
    const { sign, document, documents } = await pendingDocument();
    const stored = documents.items.get(document.id);
    if (!stored) throw new Error('document not stored');
    // Someone edits the amount directly in MongoDB and even recomputes the stored hash...
    const forged = stored.content.replace('1.500.000', '9.500.000');
    expect(forged).not.toBe(stored.content);
    documents.items.set(document.id, { ...stored, content: forged, contentHash: sha256(forged) });

    const res = await sign(document.id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'DOCUMENT_TAMPERED' } });
  });

  it('rolls the signature back with 503 when the audit trail cannot be written', async () => {
    const { sign, document, documents, audit } = await pendingDocument();
    audit.failNextAppend = true;

    const res = await sign(document.id);

    expect(res.statusCode).toBe(503);
    expect(documents.items.get(document.id)).toMatchObject({
      status: 'PENDING_SIGNATURE',
      signature: null,
    });
  });

  it('returns 404 for an unknown document', async () => {
    const { sign } = await setup();

    expect((await sign('0123456789abcdef01234567')).statusCode).toBe(404);
  });
});

describe('promissory note body rules', () => {
  it('accepts amounts with two decimals despite floating point (19.99, 0.07)', async () => {
    const { promissoryNoteBodySchema } = await import('../src/documents/document-routes.js');
    for (const amount of [19.99, 1.15, 0.29, 0.07]) {
      expect(promissoryNoteBodySchema.safeParse({ ...note, amount }).success).toBe(true);
    }
    expect(promissoryNoteBodySchema.safeParse({ ...note, amount: 10.123 }).success).toBe(false);
  });

  it('compares the due date with today in Colombia, not in UTC', async () => {
    const { promissoryNoteBodySchema } = await import('../src/documents/document-routes.js');
    vi.useFakeTimers();
    try {
      // 20:00 in Colombia on 20-Nov is already 21-Nov in UTC.
      vi.setSystemTime(new Date('2026-11-21T01:00:00Z'));
      expect(promissoryNoteBodySchema.safeParse({ ...note, dueDate: '2026-11-21' }).success).toBe(
        true,
      );
      expect(promissoryNoteBodySchema.safeParse({ ...note, dueDate: '2026-11-20' }).success).toBe(
        false,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
