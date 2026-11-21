import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'must be a 24-character hexadecimal id');

// "1.234.567-8" and "12345678" are the same document: separators are removed before validating.
export const documentNumberSchema = z
  .string()
  .overwrite((value) => value.replace(/[\s.-]/g, '').toUpperCase())
  .regex(/^[A-Z0-9]{5,20}$/, 'must contain 5 to 20 letters or digits');

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code such as CO');

export const createValidationBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  documentNumber: documentNumberSchema,
  countryCode: countryCodeSchema.default('CO'),
  phone: z
    .string()
    .overwrite((value) => value.replace(/[\s()-]/g, ''))
    .regex(/^\+[1-9]\d{7,14}$/, 'must be in E.164 format, e.g. +573001234567')
    .optional(),
});

/**
 * When a request fails validation but still identifies a document (valid
 * documentNumber and country), the route reports it to the service, which
 * audits it as VALIDATION_FAILED. Repeated failures are one of the risk signals.
 */
export const failedAttemptSchema = z.object({
  documentNumber: documentNumberSchema,
  countryCode: countryCodeSchema.default('CO'),
});

export const riskSchema = z.object({
  verdict: z.enum(['APPROVED', 'REVIEW', 'BLOCKED']),
  reasons: z.array(
    z.object({
      code: z.enum(['DOCUMENT_NAME_MISMATCH', 'SHARED_PHONE', 'REPEATED_FAILURES']),
      verdict: z.enum(['REVIEW', 'BLOCKED']),
      message: z.string(),
    }),
  ),
});

export const countrySchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string(),
  incomeLevel: z.string(),
  capital: z.string().nullable(),
});

export const validationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentNumber: z.string(),
  countryCode: z.string(),
  phone: z.string().nullable(),
  country: countrySchema,
  risk: riskSchema,
  createdAt: z.string(),
});

/**
 * Optional Idempotency-Key header (IETF draft): any client-generated unique
 * string, typically a UUID. Visible ASCII only, at most 255 characters.
 */
export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .regex(/^[\x21-\x7E]{1,255}$/, 'must be 1 to 255 visible ASCII characters, e.g. a UUID')
    .optional(),
});

export const createValidationResponseSchema = z.object({
  id: z.string(),
  ...riskSchema.shape,
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
