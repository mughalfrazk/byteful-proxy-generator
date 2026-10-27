import 'server-only'

import type { z } from 'zod'

import { AppError } from '@/lib/errors'

import { cached } from './cache'
import {
  BytefulAsnSearchSchema,
  BytefulCitySearchSchema,
  BytefulCountrySearchSchema,
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

/** Used when a 429 carries no usable `Retry-After`. */
const DEFAULT_RETRY_AFTER_MS = 1_000
/** A hostile or absurd `Retry-After` must not hold the request open. */
const MAX_RETRY_AFTER_MS = 3_000

const COUNTRY_PER_PAGE = 100
const SEARCH_PER_PAGE = 50

/** Server-side cache TTLs. Countries move rarely; city and ASN searches churn. */
const COUNTRIES_TTL_MS = 60 * 60 * 1_000
const SEARCH_TTL_MS = 10 * 60 * 1_000

type QueryValue = string | number | undefined

/**
 * The only caller of `api.byteful.com`. `'server-only'` is the first import,
 * so the build fails if any client component reaches for this module and the
 * API keys can never end up in the browser bundle.
 */
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
    // Raw values only. URLSearchParams encodes them exactly once, so a
    // `like_subdivision_id` of `gb%` goes out as `gb%25`. Pre-encoding here
    // would send `gb%2525`, which matches nothing.
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

    // A timeout or a DNS/connection failure. Both are "try again shortly".
    throw new AppError('lookup_unavailable', undefined, {
      url,
      cause: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Byteful's `api_request_id` is useful when asking them about a failure, so it
 * is logged. It is never returned to the client.
 */
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
    // An unparseable error body is not itself worth failing over.
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

/**
 * How long to wait before retrying a 429, from the response's `Retry-After`.
 *
 * Waiting the server's stated time beats guessing: a fixed delay retries too
 * early under a longer window and burns the second attempt. Only the
 * delay-seconds form is handled — the HTTP-date form is legal but Byteful does
 * not send it, and a wrong date parse would be worse than the default.
 */
function readRetryAfter(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'))

  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_AFTER_MS

  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name)

/**
 * Every country with at least one node.
 *
 * Fetches page 1, derives the page count from `total_count`, then fetches any
 * remaining pages in parallel. `min_country_node_count=1` hides countries with
 * no IPs so users cannot target them.
 *
 * `sort_by` is only here to make the paging deterministic — the list is
 * re-sorted by name below, because Byteful sorts descending by default.
 */
export const searchCountries = cached<void, Country[]>(
  COUNTRIES_TTL_MS,
  () => 'countries',
  async () => {
    const path = 'country/search'
    const query: Record<string, QueryValue> = {
      per_page: COUNTRY_PER_PAGE,
      min_country_node_count: 1,
      sort_by: 'country_name',
    }

    const firstRaw = await requestJson(path, { ...query, page: 1 })
    const first = parse(BytefulCountrySearchSchema, firstRaw, path)

    const totalPages = readTotalPages(first, COUNTRY_PER_PAGE)
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        requestJson(path, { ...query, page: i + 2 }).then((raw) =>
          parse(BytefulCountrySearchSchema, raw, path),
        ),
      ),
    )

    return [first, ...rest]
      .flatMap((page) => page.data)
      .map(narrowCountry)
      .sort(byName)
  },
)

/**
 * Cities in one country, optionally matching a query.
 *
 * Byteful has no country filter on this endpoint — passing `country_id`
 * silently returns the whole world. The country lives in `subdivision_id`, an
 * ISO 3166-2 code such as `gb-lnd`, so the filter is a prefix match on that:
 * `like_subdivision_id=gb%`.
 *
 * Unlike the country and ASN lookups, this one does **not** set a node-count
 * floor. Byteful reports `city_node_count: 0` for some cities in countries that
 * do have nodes — Singapore has 4,798 country nodes and exactly one city, at 0
 * — so a floor of 1 left those countries with an empty dropdown. Sorting by
 * node count already pushes empty cities to the bottom, and every option shows
 * its count, so the user can see what they are choosing.
 */
export const searchCities = cached(
  SEARCH_TTL_MS,
  ({ countryId, query }: { countryId: string; query?: string }) =>
    `cities:${countryId}:${query ?? ''}`,
  async ({ countryId, query }): Promise<City[]> => {
    const path = 'city/search'

    const raw = await requestJson(path, {
      like_subdivision_id: `${countryId}%`,
      like_city_name: query ? `%${query}%` : undefined,
      per_page: SEARCH_PER_PAGE,
      sort_by: 'city_node_count',
    })

    return parse(BytefulCitySearchSchema, raw, path).data.map(narrowCity)
  },
)

/** ASNs, optionally filtered by country and/or matching a query. */
export const searchAsns = cached(
  SEARCH_TTL_MS,
  ({ countryId, query }: { countryId?: string; query?: string }) =>
    `asns:${countryId ?? ''}:${query ?? ''}`,
  async ({ countryId, query }): Promise<Asn[]> => {
    const path = 'asn/search'

    const raw = await requestJson(path, {
      country_id: countryId,
      like_asn_name: query ? `%${query}%` : undefined,
      min_asn_node_count: 1,
      per_page: SEARCH_PER_PAGE,
      sort_by: 'asn_node_count',
    })

    return parse(BytefulAsnSearchSchema, raw, path).data.map(narrowAsn)
  },
)
