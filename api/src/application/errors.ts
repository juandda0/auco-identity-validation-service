/**
 * Application errors. They carry a stable machine-readable code and know
 * nothing about HTTP: the presentation layer maps them to status codes
 * (src/presentation/http/error-handler.ts).
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} ${id} was not found`);
  }
}

/** A business rule forbids the operation in the current state. */
export class ConflictError extends AppError {}

/**
 * The countries API does not recognize the code. Usually it does not exist,
 * but the World Bank API also omits a few real ISO codes (e.g. TW, AQ).
 */
export class CountryNotFoundError extends AppError {
  constructor(countryCode: string) {
    super(
      'COUNTRY_NOT_FOUND',
      `Country code ${countryCode} is not recognized by the countries API`,
    );
  }
}

/** The countries API failed (network error, 5xx or unexpected payload). */
export class UpstreamUnavailableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super('UPSTREAM_UNAVAILABLE', message, options);
  }
}

/** The countries API did not answer in time. */
export class UpstreamTimeoutError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super('UPSTREAM_TIMEOUT', message, options);
  }
}

/** The audit trail could not be read or written; writes were rolled back. */
export class AuditUnavailableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super('AUDIT_UNAVAILABLE', message, options);
  }
}

/** The Idempotency-Key was already used with a different request body. */
export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used with a different request body',
    );
  }
}

/** Another request with the same Idempotency-Key is still being processed (e.g. a double click). */
export class IdempotencyInProgressError extends ConflictError {
  constructor() {
    super(
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      'A request with this Idempotency-Key is still being processed; retry shortly',
    );
  }
}
