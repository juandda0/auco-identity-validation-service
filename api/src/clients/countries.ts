import { z } from 'zod';
import {
  CountryNotFoundError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../shared/errors.js';

export interface CountryInfo {
  code: string;
  name: string;
  region: string;
  incomeLevel: string;
  capital: string | null;
}

export interface CountriesClient {
  getByCode(countryCode: string): Promise<CountryInfo>;
}

export interface CountriesClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Wait before the single retry. */
  retryDelayMs?: number;
  /** Country data barely changes, so successful lookups are cached in memory. */
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/*
 * World Bank Countries API (free, no API key):
 *   GET {baseUrl}/country/{iso2}?format=json
 * Quirks verified with curl before writing this client:
 *   - success: [ {page metadata}, [ {country} ] ]
 *   - unknown code: HTTP 200 with [ { message: [ { id, key, value } ] } ]
 *   - regional aggregates (e.g. "ZJ") come back as countries with region.id = "NA"
 *   - some strings have trailing spaces
 */
const countrySchema = z.object({
  iso2Code: z.string(),
  name: z.string(),
  region: z.object({ id: z.string(), value: z.string() }),
  incomeLevel: z.object({ value: z.string() }),
  capitalCity: z.string(),
});

const successSchema = z.tuple([z.unknown(), z.array(countrySchema)]);
const errorSchema = z.tuple([z.object({ message: z.array(z.object({ key: z.string() })) })]);

const AGGREGATE_REGION_ID = 'NA';

export function createCountriesClient(options: CountriesClientOptions): CountriesClient {
  const {
    baseUrl,
    timeoutMs,
    retryDelayMs = 200,
    cacheTtlMs = 60 * 60 * 1000,
    fetchFn = fetch,
    now = Date.now,
  } = options;
  const cache = new Map<string, { value: CountryInfo; expiresAt: number }>();

  async function fetchOnce(code: string): Promise<CountryInfo> {
    const url = `${baseUrl}/country/${encodeURIComponent(code)}?format=json`;
    let body: unknown;
    try {
      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
      if (response.status === 404) throw new CountryNotFoundError(code);
      if (!response.ok) {
        throw new UpstreamUnavailableError(`Countries API responded with HTTP ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof CountryNotFoundError || error instanceof UpstreamUnavailableError) {
        throw error;
      }
      if (isTimeout(error)) {
        throw new UpstreamTimeoutError(`Countries API did not answer within ${timeoutMs} ms`, {
          cause: error,
        });
      }
      throw new UpstreamUnavailableError('Countries API request failed', { cause: error });
    }

    if (errorSchema.safeParse(body).success) throw new CountryNotFoundError(code);

    const parsed = successSchema.safeParse(body);
    const country = parsed.success ? parsed.data[1][0] : undefined;
    if (!country)
      throw new UpstreamUnavailableError('Countries API returned an unexpected payload');
    if (country.region.id === AGGREGATE_REGION_ID) throw new CountryNotFoundError(code);

    return {
      code: country.iso2Code.trim(),
      name: country.name.trim(),
      region: country.region.value.trim(),
      incomeLevel: country.incomeLevel.value.trim(),
      capital: country.capitalCity.trim() || null,
    };
  }

  return {
    async getByCode(countryCode) {
      const code = countryCode.toUpperCase();
      const cached = cache.get(code);
      if (cached && cached.expiresAt > now()) return cached.value;

      let value: CountryInfo;
      try {
        value = await fetchOnce(code);
      } catch (error) {
        if (!isRetryable(error)) throw error;
        await sleep(retryDelayMs);
        value = await fetchOnce(code);
      }

      cache.set(code, { value, expiresAt: now() + cacheTtlMs });
      return value;
    },
  };
}

/** Only transient failures are retried; "country does not exist" never is. */
function isRetryable(error: unknown): boolean {
  return error instanceof UpstreamTimeoutError || error instanceof UpstreamUnavailableError;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
