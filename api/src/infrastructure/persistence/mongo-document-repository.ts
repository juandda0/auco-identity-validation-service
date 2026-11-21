import { ObjectId, type Collection, type Db } from 'mongodb';
import type { DocumentRepository } from '../../application/ports.js';
import type { DocumentRecord } from '../../domain/document.js';

type MongoDocument = Omit<DocumentRecord, 'id'> & { _id: ObjectId };

export function createMongoDocumentRepository(db: Db): DocumentRepository {
  const collection: Collection<MongoDocument> = db.collection('documents');

  return {
    async insert(document) {
      const { id, ...rest } = document;
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

    async markSigned(id, signature) {
      // The status condition makes the transition atomic: a second request matches nothing.
      const result = await collection.updateOne(
        { _id: new ObjectId(id), status: 'PENDING_SIGNATURE' },
        { $set: { status: 'SIGNED', signature } },
      );
      return result.modifiedCount === 1;
    },

    async revertSignature(id) {
      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'PENDING_SIGNATURE', signature: null } },
      );
    },
  };
}
