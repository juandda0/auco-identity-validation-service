import { ObjectId, type Collection, type Db } from 'mongodb';
import type { ValidationRepository } from '../../application/ports.js';
import type { ValidationRecord } from '../../domain/validation.js';

type ValidationDocument = Omit<ValidationRecord, 'id'> & { _id: ObjectId };

export function createMongoValidationRepository(db: Db): ValidationRepository {
  const collection: Collection<ValidationDocument> = db.collection('validations');

  return {
    async insert(record) {
      const { id, ...rest } = record;
      await collection.insertOne({ _id: new ObjectId(id), ...rest });
    },

    async findById(id) {
      const doc = await collection.findOne({ _id: new ObjectId(id) });
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return { id: _id.toHexString(), ...rest };
    },

    async deleteById(id) {
      await collection.deleteOne({ _id: new ObjectId(id) });
    },
  };
}

export async function ensureValidationIndexes(db: Db): Promise<void> {
  await db
    .collection('validations')
    .createIndex({ countryCode: 1, documentNumber: 1, createdAt: -1 });
}
