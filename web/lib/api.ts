/** Typed client for the validation API. Errors keep the API's code and message. */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type Verdict = 'APPROVED' | 'REVIEW' | 'BLOCKED';

export interface RiskReason {
  code: 'DOCUMENT_NAME_MISMATCH' | 'SHARED_PHONE' | 'REPEATED_FAILURES';
  verdict: Exclude<Verdict, 'APPROVED'>;
  message: string;
}

export interface Validation {
  id: string;
  name: string;
  documentNumber: string;
  countryCode: string;
  phone: string | null;
  country: { code: string; name: string; region: string; incomeLevel: string; capital: string | null };
  risk: { verdict: Verdict; reasons: RiskReason[] };
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  validationId: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED';
  fields: { amount: number; currency: string; dueDate: string; creditorName: string; city: string };
  content: string;
  contentHash: string;
  signature: { signedAt: string; ip: string; userAgent: string | null; elapsedMs: number } | null;
  createdAt: string;
}

export interface AuditEvent {
  eventId: string;
  eventType: 'VALIDATION_CREATED' | 'VALIDATION_FAILED' | 'DOCUMENT_GENERATED' | 'DOCUMENT_SIGNED';
  occurredAt: string;
  validationId?: string;
  documentId?: string;
  verdict?: string;
  reasons?: string[];
  contentHash?: string;
  ip?: string;
  detail?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set('content-type', 'application/json');
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the API at ${API_URL}. Is it running?`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code: string; message: string; details?: [] } } | null)
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `HTTP ${response.status}`,
      error?.details,
    );
  }
  return body as T;
}

export const api = {
  /** `idempotencyKey` makes retries safe: the same key never creates a second validation. */
  createValidation: (
    input: { name: string; documentNumber: string; countryCode?: string; phone?: string },
    idempotencyKey: string,
  ) =>
    request<{ id: string; verdict: Verdict; reasons: RiskReason[] }>('/validations', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'idempotency-key': idempotencyKey },
    }),
  getValidation: (id: string) => request<Validation>(`/validations/${id}`),
  createPromissoryNote: (
    validationId: string,
    input: { amount: number; currency?: string; dueDate: string; creditorName: string; city?: string },
  ) =>
    request<DocumentRecord>(`/validations/${validationId}/promissory-notes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  sign: (documentId: string) =>
    request<DocumentRecord>(`/documents/${documentId}/sign`, { method: 'POST' }),
  timeline: (countryCode: string, documentNumber: string) =>
    request<{ documentKey: string; events: AuditEvent[] }>(
      `/audit/${countryCode}/${encodeURIComponent(documentNumber)}`,
    ),
};
