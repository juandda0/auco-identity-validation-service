/**
 * Integration tests against the real MongoDB and DynamoDB Local from docker compose:
 *   docker compose up -d mongo dynamodb && npm run test:e2e
 * They cover what the in-memory fakes cannot prove: key design, GSI queries,
 * conditional writes and atomic updates.
 */
import { randomUUID } from 'node:crypto';
import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { MongoClient, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDynamoAuditRepository,
  ensureAuditTable,
} from '../../src/infrastructure/persistence/dynamo-audit-repository.js';
import { createMongoDocumentRepository } from '../../src/infrastructure/persistence/mongo-document-repository.js';
import type { DocumentRecord } from '../../src/domain/document.js';
import {
  createMongoIdempotencyStore,
  ensureIdempotencyIndexes,
} from '../../src/infrastructure/persistence/mongo-idempotency-store.js';

const dynamo = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8001',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const mongo = new MongoClient(process.env.MONGO_URI ?? 'mongodb://localhost:27018');
const table = `audit_events_e2e_${randomUUID().slice(0, 8)}`;
const dbName = `auco_e2e_${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await ensureAuditTable(dynamo, table);
  await ensureAuditTable(dynamo, table); // idempotent
  await mongo.connect();
});

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: table }));
  await mongo.db(dbName).dropDatabase();
  await mongo.close();
  dynamo.destroy();
});

describe('DynamoDB audit repository', () => {
  const audit = createDynamoAuditRepository(dynamo, table);

  it('returns a document history in chronological order with one partition-key query', async () => {
    const base = { countryCode: 'CO', documentNumber: '1020304050' } as const;
    await audit.append({
      ...base,
      eventType: 'DOCUMENT_SIGNED',
      occurredAt: new Date('2026-11-20T10:00:02Z'),
    });
    await audit.append({
      ...base,
      eventType: 'VALIDATION_CREATED',
      occurredAt: new Date('2026-11-20T10:00:00Z'),
    });
    await audit.append({
      ...base,
      eventType: 'DOCUMENT_GENERATED',
      occurredAt: new Date('2026-11-20T10:00:01Z'),
    });
    await audit.append({
      countryCode: 'PE',
      documentNumber: '1020304050',
      eventType: 'VALIDATION_CREATED',
    });

    const events = await audit.listByDocument('CO#1020304050');

    expect(events.map((e) => e.eventType)).toEqual([
      'VALIDATION_CREATED',
      'DOCUMENT_GENERATED',
      'DOCUMENT_SIGNED',
    ]);
    expect(events[0]?.sk).toMatch(/^2026-11-20T10:00:00\.000Z#/);
  });

  it('finds every document that used a phone through the phone GSI', async () => {
    const phone = `+5730${Date.now().toString().slice(-8)}`;
    await audit.append({
      countryCode: 'CO',
      documentNumber: '11111111',
      eventType: 'VALIDATION_CREATED',
      phone,
    });
    await audit.append({
      countryCode: 'CO',
      documentNumber: '22222222',
      eventType: 'VALIDATION_CREATED',
      phone,
    });
    await audit.append({
      countryCode: 'CO',
      documentNumber: '33333333',
      eventType: 'VALIDATION_CREATED',
    });

    const events = await audit.listByPhone(phone);

    expect(events.map((e) => e.documentKey).sort()).toEqual(['CO#11111111', 'CO#22222222']);
  });

  it('never overwrites an existing event (conditional put)', async () => {
    const event = await audit.append({
      countryCode: 'CO',
      documentNumber: '44444444',
      eventType: 'VALIDATION_CREATED',
    });
    const doc = DynamoDBDocumentClient.from(dynamo);

    const overwrite = doc.send(
      new PutCommand({
        TableName: table,
        Item: { ...event, eventType: 'VALIDATION_FAILED' },
        ConditionExpression: 'attribute_not_exists(documentKey) AND attribute_not_exists(sk)',
      }),
    );

    await expect(overwrite).rejects.toThrow(/conditional/i);
  });
});

describe('MongoDB document repository', () => {
  it('lets only one of two concurrent signatures win', async () => {
    const documents = createMongoDocumentRepository(mongo.db(dbName));
    const id = new ObjectId().toHexString();
    const document: DocumentRecord = {
      id,
      validationId: new ObjectId().toHexString(),
      type: 'PROMISSORY_NOTE',
      fields: { amount: 1, currency: 'COP', dueDate: '2099-01-01', creditorName: 'X', city: 'Y' },
      content: 'demo',
      contentHash: 'hash',
      status: 'PENDING_SIGNATURE',
      signature: null,
      createdAt: new Date(),
    };
    await documents.insert(document);
    const signature = { signedAt: new Date(), ip: '127.0.0.1', userAgent: null, elapsedMs: 1 };

    const results = await Promise.all([
      documents.markSigned(id, signature),
      documents.markSigned(id, signature),
      documents.markSigned(id, signature),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await documents.findById(id))?.status).toBe('SIGNED');
  });
});

describe('MongoDB idempotency store', () => {
  it('lets exactly one of several simultaneous claims win, then replays the stored value', async () => {
    const db = mongo.db(dbName);
    await ensureIdempotencyIndexes(db);
    const store = createMongoIdempotencyStore(db);
    const now = new Date();
    const times = { now, expiresAt: new Date(now.getTime() + 60_000), staleBefore: new Date(0) };

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => store.begin('POST /validations|k1', 'hash-a', times)),
    );
    expect(claims.filter((c) => c.state === 'new')).toHaveLength(1);
    expect(claims.filter((c) => c.state === 'in_progress')).toHaveLength(4);

    await store.complete('POST /validations|k1', { id: 'abc' });
    await expect(store.begin('POST /validations|k1', 'hash-a', times)).resolves.toEqual({
      state: 'completed',
      value: { id: 'abc' },
    });
    await expect(store.begin('POST /validations|k1', 'hash-b', times)).resolves.toEqual({
      state: 'mismatch',
    });

    const indexes = await db.collection('idempotency_keys').indexes();
    expect(indexes.find((i) => i.name === 'expiresAt_1')).toMatchObject({ expireAfterSeconds: 0 });
  });
});
