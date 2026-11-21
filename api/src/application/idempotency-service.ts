import { createHash } from 'node:crypto';
import { IdempotencyInProgressError, IdempotencyKeyReusedError } from './errors.js';
import type { IdempotencyStore } from './ports.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyServiceDeps {
  store: IdempotencyStore;
  now?: () => Date;
  /** How long a completed response can be replayed (default 24 h). */
  ttlMs?: number;
  /** After this long an unfinished claim is considered abandoned (default 30 s). */
  staleAfterMs?: number;
}

export type IdempotencyService = ReturnType<typeof createIdempotencyService>;

/**
 * Makes a write safe to retry: the same key with the same request runs the
 * operation once and replays its result afterwards (Idempotency-Key header,
 * IETF draft "The Idempotency-Key HTTP Header Field").
 */
export function createIdempotencyService(deps: IdempotencyServiceDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs ?? DAY_MS;
  const staleAfterMs = deps.staleAfterMs ?? 30_000;

  return {
    async run<T>(
      scope: string,
      key: string,
      request: unknown,
      operation: () => Promise<T>,
    ): Promise<{ value: T; replayed: boolean }> {
      // The scope keeps the same key from colliding across different endpoints.
      const id = `${scope}|${key}`;
      const at = now();
      const claim = await store.begin(id, hashRequest(request), {
        now: at,
        expiresAt: new Date(at.getTime() + ttlMs),
        staleBefore: new Date(at.getTime() - staleAfterMs),
      });

      switch (claim.state) {
        case 'completed':
          return { value: claim.value as T, replayed: true };
        case 'mismatch':
          throw new IdempotencyKeyReusedError();
        case 'in_progress':
          throw new IdempotencyInProgressError();
        case 'new':
          break;
      }

      let value: T;
      try {
        value = await operation();
      } catch (error) {
        // Failures are not remembered: the client may retry with the same key.
        await store.release(id);
        throw error;
      }
      await store.complete(id, value);
      return { value, replayed: false };
    },
  };
}

/** SHA-256 of the request with object keys sorted, so key order does not matter. */
export function hashRequest(request: unknown): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
