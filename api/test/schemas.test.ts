import { describe, expect, it } from 'vitest';
import { createValidationBodySchema } from '../src/presentation/http/schemas.js';
import { normalizeName } from '../src/domain/normalize.js';

describe('createValidationBodySchema', () => {
  it('accepts the minimal contract from the exercise (name + documentNumber) and defaults the country to CO', () => {
    expect(
      createValidationBodySchema.parse({ name: 'Ana Gómez', documentNumber: '1020304050' }),
    ).toEqual({
      name: 'Ana Gómez',
      documentNumber: '1020304050',
      countryCode: 'CO',
    });
  });

  it('normalizes separators so "1.020.304-050" and "1020304050" are the same document', () => {
    const parsed = createValidationBodySchema.parse({
      name: '  Ana Gómez ',
      documentNumber: '1.020.304-050',
      countryCode: 'pe',
      phone: '+57 300 123 4567',
    });
    expect(parsed).toEqual({
      name: 'Ana Gómez',
      documentNumber: '1020304050',
      countryCode: 'PE',
      phone: '+573001234567',
    });
  });

  it.each([
    ['missing name', { documentNumber: '1020304050' }],
    ['name too short', { name: 'A', documentNumber: '1020304050' }],
    ['document too short', { name: 'Ana', documentNumber: '123' }],
    ['document with symbols', { name: 'Ana', documentNumber: '1020$04050' }],
    ['country not alpha-2', { name: 'Ana', documentNumber: '1020304050', countryCode: 'COL' }],
    ['phone without +', { name: 'Ana', documentNumber: '1020304050', phone: '3001234567' }],
    ['document as number', { name: 'Ana', documentNumber: 1020304050 }],
  ])('rejects %s', (_label, body) => {
    expect(createValidationBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('normalizeName', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizeName('  JOSÉ   Pérez ')).toBe(normalizeName('jose perez'));
  });
});
