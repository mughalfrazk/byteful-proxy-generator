import 'server-only'

import type { z } from 'zod'

import { AppError } from '@/lib/errors'

import { cached } from './cache'
import {
  BytefulAsnAvailabilityResponseSchema,
  BytefulCityAvailabilityResponseSchema,
  BytefulCitySearchSchema,
  BytefulCountryAvailabilityResponseSchema,
  narrowAsn,
  narrowCity,
  narrowCountry,
  readTotalPages,
  type Asn,
  type City,
  type Country,
} from '@/lib/models'

const BASE_URL = 'https://api.byteful.com/1.0/public/user/'
const TIMEOUT_MS = 8_000

/** Byteful's 429s carry no `Retry-After`; one second is its rate window. */
const DEFAULT_RETRY_AFTER_MS = 1_000
const MAX_RETRY_AFTER_MS = 3_000

/** Byteful rejects a `per_page` above 1000. */
const CITY_PER_PAGE = 1_000

/** Availability is live, so it matches the browser's cache window; aliases never change. */
const AVAILABILITY_TTL_MS = 5 * 60 * 1_000
const CITY_ALIASES_TTL_MS = 60 * 60 * 1_000

type QueryValue = string | number | undefined

/** Reads the keys. `server-only` above fails the build if this reaches the client. */
function headers(): HeadersInit {
  const publicKey = process.env.BYTEFUL_PUBLIC_KEY
  const privateKey = process.env.BYTEFUL_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    throw new AppError(
      'server_misconfigured',
      'Byteful API keys are not configured on the server.',
    )
  }

  return {
    'X-API-Public-Key': publicKey,
    'X-API-Private-Key': privateKey,
    Accept: 'application/json',
  }
}

function buildUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(path, BASE_URL)

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue
    // Raw values: URLSearchParams encodes `gb%` as `gb%25` itself.
    url.searchParams.set(key, String(value))
  }

  return url.toString()
}

async function requestJson(
  path: string,
  query: Record<string, QueryValue>,
): Promise<unknown> {
  const url = buildUrl(path, query)

  let response = await send(url)

  if (response.status === 429) {
    await sleep(readRetryAfter(response))
    response = await send(url)
  }

  if (response.status === 401 || response.status === 403) {
    // A rejected key is our problem, not the user's.
    throw new AppError(
      'server_misconfigured',
      'The server could not authenticate with the location service.',
      await errorContext(response, url),
    )
  }

  if (response.status === 429) {
    throw new AppError('lookup_unavailable', undefined, {
      url,
      status: response.status,
    })
  }

  if (!response.ok) {
    throw new AppError(
      'upstream_error',
      'The location service returned an unexpected error.',
      await errorContext(response, url),
    )
  }

  try {
    return await response.json()
  } catch {
    throw new AppError('upstream_invalid_response', undefined, { url })
  }
}

async function send(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof AppError) throw err

    // Timeout or connection failure.
    throw new AppError('lookup_unavailable', undefined, {
      url,
      cause: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Logs Byteful's `api_request_id` for support; it is never returned. */
async function errorContext(
  response: Response,
  url: string,
): Promise<Record<string, unknown>> {
  let apiRequestId: unknown
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'api_request_id' in body) {
      apiRequestId = (body as { api_request_id: unknown }).api_request_id
    }
  } catch {
    // An unparsable error body is not worth failing over.
  }

  return { url, status: response.status, api_request_id: apiRequestId }
}

function parse<T extends z.ZodType>(schema: T, raw: unknown, url: string) {
  const result = schema.safeParse(raw)

  if (!result.success) {
    console.error('[byteful] unexpected response shape', url, result.error.issues)
    throw new AppError('upstream_invalid_response', undefined, { url })
  }

  return result.data as z.infer<T>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The delay-seconds form of `Retry-After`, capped; the default otherwise. */
function readRetryAfter(response: Response): number {
  // Checked before `Number()`, which turns a missing or blank header into 0.
  const header = response.headers.get('Retry-After')?.trim()
  if (!header) return DEFAULT_RETRY_AFTER_MS

  const seconds = Number(header)

  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_AFTER_MS

  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name)

const byNodeCount = (
  a: { name: string; nodeCount: number },
  b: { name: string; nodeCount: number },
) => b.nodeCount - a.nodeCount || byName(a, b)

const hasNodes = (item: { nodeCount: number }) => item.nodeCount > 0

/**
 * Live node counts grouped by country, city or ASN, as Byteful's dashboard
 * shows them. One call returns a whole group. Used instead of the search
 * endpoints, whose counts and ASN countries do not match what is routable;
 * see the README. `country_id` must be lowercase.
 */
async function searchAvailability<T extends z.ZodType>(
  schema: T,
  query: Record<string, QueryValue>,
) {
  const path = 'residential_availability/search'
  const raw = await requestJson(path, query)
  return parse(schema, raw, path)
}

/** Every country with live nodes, by name. */
export const searchCountries = cached<void, Country[]>(
  AVAILABILITY_TTL_MS,
  () => 'countries',
  async () => {
    const response = await searchAvailability(
      BytefulCountryAvailabilityResponseSchema,
      { group_by: 'country' },
    )

    return response.data.residential_availability
      .map(narrowCountry)
      .filter(hasNodes)
      .sort(byName)
  },
)

/**
 * `city_id` → the `city/search` row with its alias, for one country.
 *
 * `city/search` has no country filter, so this prefix-matches the ISO 3166-2
 * `subdivision_id` (`gb-lnd`). `min_city_node_count=1` cuts the pages without
 * losing any city that availability lists.
 */
const searchCityAliases = cached(
  CITY_ALIASES_TTL_MS,
  ({ countryId }: { countryId: string }) => `city-aliases:${countryId}`,
  async ({ countryId }) => {
    const path = 'city/search'
    const query: Record<string, QueryValue> = {
      like_subdivision_id: `${countryId}%`,
      min_city_node_count: 1,
      per_page: CITY_PER_PAGE,
    }

    const firstRaw = await requestJson(path, { ...query, page: 1 })
    const first = parse(BytefulCitySearchSchema, firstRaw, path)

    const totalPages = readTotalPages(first, CITY_PER_PAGE)
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        requestJson(path, { ...query, page: i + 2 }).then((raw) =>
          parse(BytefulCitySearchSchema, raw, path),
        ),
      ),
    )

    return new Map(
      [first, ...rest]
        .flatMap((page) => page.data)
        .map((city) => [city.city_id, city] as const),
    )
  },
)

/**
 * Every city in one country with live nodes, busiest first. Availability has
 * no alias, so it is joined to `city/search` on `city_id`; a live city without
 * an alias cannot be targeted and is dropped.
 */
export const searchCities = cached(
  AVAILABILITY_TTL_MS,
  ({ countryId }: { countryId: string }) => `cities:${countryId}`,
  async ({ countryId }): Promise<City[]> => {
    const [live, aliases] = await Promise.all([
      searchAvailability(BytefulCityAvailabilityResponseSchema, {
        country_id: countryId,
        group_by: 'city',
      }),
      searchCityAliases({ countryId }),
    ])

    const cities: City[] = []
    let unmatched = 0

    for (const row of live.data.residential_availability) {
      const info = aliases.get(row.city_id)
      if (info) cities.push(narrowCity(row, info))
      else unmatched += 1
    }

    if (unmatched > 0) {
      console.error('[byteful] live cities with no alias', {
        countryId,
        unmatched,
      })
    }

    return cities.filter(hasNodes).sort(byNodeCount)
  },
)

/**
 * Every ASN with live nodes worldwide, in a country, or in one of its cities,
 * busiest first. Filters by the undocumented `city_id` rather than
 * `city_name`, because city names repeat within a country.
 */
export const searchAsns = cached(
  AVAILABILITY_TTL_MS,
  ({ countryId, cityId }: { countryId?: string; cityId?: number }) =>
    `asns:${countryId ?? ''}:${cityId ?? ''}`,
  async ({ countryId, cityId }): Promise<Asn[]> => {
    const response = await searchAvailability(
      BytefulAsnAvailabilityResponseSchema,
      { country_id: countryId, city_id: cityId, group_by: 'asn' },
    )

    return response.data.residential_availability
      .map(narrowAsn)
      .filter(hasNodes)
      .sort(byNodeCount)
  },
)
