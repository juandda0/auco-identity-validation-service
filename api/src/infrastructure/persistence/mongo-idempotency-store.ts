import { MongoServerError, type Db } from 'mongodb';
import type { IdempotencyBegin, IdempotencyStore } from '../../application/ports.js';

interface IdempotencyDocument {
  _id: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  value?: unknown;
  createdAt: Date;
  /** A TTL index deletes the document after this date. */
  expiresAt: Date;
}

const DUPLICATE_KEY = 11000;

export function createMongoIdempotencyStore(db: Db): IdempotencyStore {
  const collection = db.collection<IdempotencyDocument>('idempotency_keys');

  async function begin(
    id: string,
    requestHash: string,
    times: { now: Date; expiresAt: Date; staleBefore: Date },
    attempt = 1,
  ): Promise<IdempotencyBegin> {
    try {
      // The unique _id makes the claim atomic: of two simultaneous requests, one insert wins.
      await collection.insertOne({
        _id: id,
        requestHash,
        status: 'IN_PROGRESS',
        createdAt: times.now,
        expiresAt: times.expiresAt,
      });
      return { state: 'new' };
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) throw error;
    }

    const existing = await collection.findOne({ _id: id });
    // Released (or expired) between the insert and the read: try once more.
    if (!existing)
      return attempt === 1 ? begin(id, requestHash, times, 2) : { state: 'in_progress' };
    if (existing.requestHash !== requestHash) return { state: 'mismatch' };
    if (existing.status === 'COMPLETED') return { state: 'completed', value: existing.value };

    if (existing.createdAt < times.staleBefore) {
      // Abandoned claim (its process probably crashed): take it over, atomically.
      const takeover = await collection.updateOne(
        { _id: id, status: 'IN_PROGRESS', createdAt: existing.createdAt },
        { $set: { createdAt: times.now, expiresAt: times.expiresAt } },
      );
      if (takeover.modifiedCount === 1) return { state: 'new' };
    }
    return { state: 'in_progress' };
  }

  return {
    begin: (id, requestHash, times) => begin(id, requestHash, times),

    async complete(id, value) {
      await collection.updateOne({ _id: id }, { $set: { status: 'COMPLETED', value } });
    },

    async release(id) {
      await collection.deleteOne({ _id: id, status: 'IN_PROGRESS' });
    },
  };
}

export async function ensureIdempotencyIndexes(db: Db): Promise<void> {
  // TTL index: MongoDB deletes each key once its expiresAt has passed.
  await db
    .collection('idempotency_keys')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }, undefined);
}
