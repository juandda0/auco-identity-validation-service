import { ObjectId } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { documentKeyOf, type AuditRepository } from '../audit/audit-event.js';
import { AuditUnavailableError, ConflictError, NotFoundError } from '../shared/errors.js';
import type { ValidationRepository } from '../validations/validation.js';
import type { DocumentRecord, DocumentRepository, PromissoryNoteFields } from './document.js';
import { renderPromissoryNote, sha256 } from './promissory-note.js';

export interface DocumentServiceDeps {
  validations: ValidationRepository;
  documents: DocumentRepository;
  audit: AuditRepository;
  logger: Pick<FastifyBaseLogger, 'error' | 'warn'>;
  newId?: () => string;
  now?: () => Date;
}

export type PromissoryNoteInput = Omit<PromissoryNoteFields, 'city'> & {
  city?: string | undefined;
};

export interface SignatureContext {
  ip: string;
  userAgent: string | null;
}

export type DocumentService = ReturnType<typeof createDocumentService>;

export function createDocumentService(deps: DocumentServiceDeps) {
  const { validations, documents, audit, logger } = deps;
  const newId = deps.newId ?? (() => new ObjectId().toHexString());
  const now = deps.now ?? (() => new Date());

  async function getValidation(id: string) {
    const validation = await validations.findById(id);
    if (!validation) throw new NotFoundError('Validation', id);
    return validation;
  }

  return {
    async createPromissoryNote(validationId: string, input: PromissoryNoteInput) {
      const validation = await getValidation(validationId);
      if (validation.risk.verdict !== 'APPROVED') {
        throw new ConflictError(
          'VALIDATION_NOT_APPROVED',
          `Only APPROVED validations can generate documents (this one is ${validation.risk.verdict})`,
        );
      }

      const createdAt = now();
      const fields: PromissoryNoteFields = {
        ...input,
        city: input.city ?? validation.country.capital ?? validation.country.name,
      };
      const content = renderPromissoryNote(validation, fields, createdAt);
      const document: DocumentRecord = {
        id: newId(),
        validationId,
        type: 'PROMISSORY_NOTE',
        fields,
        content,
        contentHash: sha256(content),
        status: 'PENDING_SIGNATURE',
        signature: null,
        createdAt,
      };
      await documents.insert(document);

      try {
        await audit.append({
          eventType: 'DOCUMENT_GENERATED',
          occurredAt: createdAt,
          countryCode: validation.countryCode,
          documentNumber: validation.documentNumber,
          validationId,
          documentId: document.id,
          contentHash: document.contentHash,
        });
      } catch (error) {
        await documents.deleteById(document.id).catch((cleanupError: unknown) => {
          logger.error({ err: cleanupError, documentId: document.id }, 'Compensation failed');
        });
        throw new AuditUnavailableError(
          'Audit trail is unavailable, the document was not created',
          {
            cause: error,
          },
        );
      }

      return document;
    },

    async getById(id: string): Promise<DocumentRecord> {
      const document = await documents.findById(id);
      if (!document) throw new NotFoundError('Document', id);
      return document;
    },

    /**
     * Signs a document. The content hash is recomputed and compared with the
     * hash written to the immutable audit trail when the document was
     * generated, so a document edited in MongoDB afterwards cannot be signed.
     */
    async sign(id: string, context: SignatureContext): Promise<DocumentRecord> {
      const document = await documents.findById(id);
      if (!document) throw new NotFoundError('Document', id);
      if (document.status === 'SIGNED') {
        throw new ConflictError('ALREADY_SIGNED', 'The document is already signed');
      }
      const validation = await getValidation(document.validationId);
      const documentKey = documentKeyOf(validation.countryCode, validation.documentNumber);

      const history = await audit.listByDocument(documentKey).catch((error: unknown) => {
        throw new AuditUnavailableError('Audit history is unavailable', { cause: error });
      });
      const generated = history.find(
        (e) => e.eventType === 'DOCUMENT_GENERATED' && e.documentId === id,
      );
      if (generated?.contentHash !== sha256(document.content)) {
        throw new ConflictError(
          'DOCUMENT_TAMPERED',
          'The document content does not match the hash recorded in the audit trail',
        );
      }

      const signedAt = now();
      const signature = {
        signedAt,
        ip: context.ip,
        userAgent: context.userAgent,
        elapsedMs: signedAt.getTime() - validation.createdAt.getTime(),
      };
      if (!(await documents.markSigned(id, signature))) {
        throw new ConflictError('ALREADY_SIGNED', 'The document is already signed');
      }

      try {
        await audit.append({
          eventType: 'DOCUMENT_SIGNED',
          occurredAt: signedAt,
          countryCode: validation.countryCode,
          documentNumber: validation.documentNumber,
          validationId: validation.id,
          documentId: id,
          contentHash: generated.contentHash,
          ip: context.ip,
        });
      } catch (error) {
        await documents.revertSignature(id).catch((cleanupError: unknown) => {
          logger.error({ err: cleanupError, documentId: id }, 'Compensation failed');
        });
        throw new AuditUnavailableError('Audit trail is unavailable, the document was not signed', {
          cause: error,
        });
      }

      return { ...document, status: 'SIGNED', signature };
    },
  };
}
