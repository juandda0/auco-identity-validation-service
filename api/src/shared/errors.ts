/**
 * Domain errors. Each one carries the HTTP status and a stable machine-readable
 * code, so the single error handler in app.ts can translate them without
 * knowing about individual use cases.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
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
    super(404, 'NOT_FOUND', `${resource} ${id} was not found`);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

/**
 * The external countries API does not recognize the code. Usually it does not
 * exist, but the World Bank API also omits a few real ISO codes (e.g. TW, AQ).
 */
export class CountryNotFoundError extends AppError {
  constructor(countryCode: string) {
    super(
      422,
      'COUNTRY_NOT_FOUND',
      `Country code ${countryCode} is not recognized by the countries API`,
    );
  }
}

/** The external countries API failed (network error, 5xx or unexpected payload). */
export class UpstreamUnavailableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(502, 'UPSTREAM_UNAVAILABLE', message, options);
  }
}

/** The external countries API did not answer in time. */
export class UpstreamTimeoutError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(504, 'UPSTREAM_TIMEOUT', message, options);
  }
}

/** The audit trail could not be written, so the operation was rolled back. */
export class AuditUnavailableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(503, 'AUDIT_UNAVAILABLE', message, options);
  }
}
