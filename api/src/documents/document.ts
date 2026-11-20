export type DocumentStatus = 'PENDING_SIGNATURE' | 'SIGNED';

export interface PromissoryNoteFields {
  amount: number;
  currency: string;
  /** YYYY-MM-DD */
  dueDate: string;
  creditorName: string;
  city: string;
}

export interface Signature {
  signedAt: Date;
  ip: string;
  userAgent: string | null;
  /** Time from the identity validation to the signature (the "signing stopwatch"). */
  elapsedMs: number;
}

export interface DocumentRecord {
  id: string;
  validationId: string;
  type: 'PROMISSORY_NOTE';
  fields: PromissoryNoteFields;
  content: string;
  /** SHA-256 of `content`, also stored in the immutable audit trail. */
  contentHash: string;
  status: DocumentStatus;
  signature: Signature | null;
  createdAt: Date;
}

export interface DocumentRepository {
  insert(document: DocumentRecord): Promise<void>;
  findById(id: string): Promise<DocumentRecord | null>;
  deleteById(id: string): Promise<void>;
  /**
   * Atomically moves PENDING_SIGNATURE -> SIGNED. Returns false when the
   * document was already signed (e.g. a double click), so only one wins.
   */
  markSigned(id: string, signature: Signature): Promise<boolean>;
  /** Compensation when the signature cannot be audited. */
  revertSignature(id: string): Promise<void>;
}
