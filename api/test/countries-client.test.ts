import { describe, expect, it, vi } from 'vitest';
import { createCountriesClient } from '../src/clients/countries.js';
import {
  CountryNotFoundError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../src/shared/errors.js';

// Real payloads captured from api.worldbank.org with curl (trimmed).
const colombiaPayload = [
  { page: 1, pages: 1, per_page: '50', total: 1 },
  [
    {
      id: 'COL',
      iso2Code: 'CO',
      name: 'Colombia',
      region: { id: 'LCN', iso2code: 'ZJ', value: 'Latin America & Caribbean ' },
      incomeLevel: { id: 'UMC', iso2code: 'XT', value: 'Upper middle income' },
      capitalCity: 'Bogota',
    },
  ],
];
const invalidCodePayload = [
  {
    message: [
      { id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid' },
    ],
  },
];
const aggregatePayload = [
  { page: 1 },
  [
    {
      iso2Code: 'ZJ',
      name: 'Latin America & Caribbean ',
      region: { id: 'NA', value: 'Aggregates' },
      incomeLevel: { value: 'Aggregates' },
      capitalCity: '',
    },
  ],
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that never answers until its AbortSignal fires (simulates a hung upstream). */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(init.signal?.reason as Error);
    });
  });

function client(fetchFn: typeof fetch, timeoutMs = 1000) {
  return createCountriesClient({
    baseUrl: 'https://wb.test/v2',
    timeoutMs,
    retryDelayMs: 0,
    fetchFn,
  });
}

describe('countries client (World Bank API)', () => {
  it('maps the payload and trims trailing spaces', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(colombiaPayload));

    await expect(client(fetchFn).getByCode('co')).resolves.toEqual({
      code: 'CO',
      name: 'Colombia',
      region: 'Latin America & Caribbean',
      incomeLevel: 'Upper middle income',
      capital: 'Bogota',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://wb.test/v2/country/CO?format=json',
      expect.anything(),
    );
  });

  it('treats the 200 "Invalid value" message as an unknown country and does not retry', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(invalidCodePayload));

    await expect(client(fetchFn).getByCode('ZZ')).rejects.toBeInstanceOf(CountryNotFoundError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects regional aggregates such as ZJ as unknown countries', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(aggregatePayload));

    await expect(client(fetchFn).getByCode('ZJ')).rejects.toBeInstanceOf(CountryNotFoundError);
  });

  it('retries once after a 5xx and succeeds', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(colombiaPayload));

    await expect(client(fetchFn).getByCode('CO')).resolves.toMatchObject({ code: 'CO' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry with UPSTREAM_UNAVAILABLE (502)', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, 500));

    const error = await client(fetchFn)
      .getByCode('CO')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamUnavailableError);
    expect(error).toMatchObject({ statusCode: 502 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('turns network errors and unexpected payloads into UPSTREAM_UNAVAILABLE', async () => {
    const network = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const garbage = vi.fn<typeof fetch>().mockResolvedValue(json({ unexpected: true }));

    await expect(client(network).getByCode('CO')).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(client(garbage).getByCode('CO')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('times out with UPSTREAM_TIMEOUT (504) after retrying once', async () => {
    const fetchFn = vi.fn<typeof fetch>(hangingFetch);

    const error = await client(fetchFn, 20)
      .getByCode('CO')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect(error).toMatchObject({ statusCode: 504 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('caches successful lookups', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => json(colombiaPayload));
    const countries = client(fetchFn);

    await countries.getByCode('CO');
    await countries.getByCode('co');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
