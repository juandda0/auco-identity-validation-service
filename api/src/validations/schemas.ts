import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'must be a 24-character hexadecimal id');

export const createValidationBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  // "1.234.567-8" and "12345678" are the same document: separators are removed before validating.
  documentNumber: z
    .string()
    .overwrite((value) => value.replace(/[\s.-]/g, '').toUpperCase())
    .regex(/^[A-Z0-9]{5,20}$/, 'must contain 5 to 20 letters or digits'),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code such as CO')
    .default('CO'),
  phone: z
    .string()
    .overwrite((value) => value.replace(/[\s()-]/g, ''))
    .regex(/^\+[1-9]\d{7,14}$/, 'must be in E.164 format, e.g. +573001234567')
    .optional(),
});

export type CreateValidationInput = z.infer<typeof createValidationBodySchema>;

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
  createdAt: z.string(),
});

export const createValidationResponseSchema = z.object({
  id: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
