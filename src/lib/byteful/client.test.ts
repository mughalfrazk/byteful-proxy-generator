import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppError, ErrorCode } from '@/lib/errors'

/**
 * The fixtures here mirror real Byteful responses (field names, and pagination
 * carried at the top level alongside `data`), so these tests pin down the
 * error table, the query strings and the cache without touching the network.
 */

type FetchMock = ReturnType<typeof vi.fn>

const fetchMock: FetchMock = vi.fn()

/** A fresh module instance, so the in-process cache starts empty. */
async function loadClient() {
  vi.resetModules()
  return import('./client')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A `residential_availability/search` body, shaped as Byteful returns it. */
function availability(rows: Array<Record<string, unknown>>) {
  return {
    data: {
      residential_availability: rows,
      total_residential_availability_node_count: rows.reduce(
        (sum, row) => sum + Number(row.residential_availability_node_count),
        0,
      ),
    },
    message: 'Residential Options search successful',
  }
}

function countries(rows: Array<[string, string, number]>) {
  return availability(
    rows.map(([country_id, country_name, count]) => ({
      country_id,
      country_name,
      residential_availability_node_count: count,
    })),
  )
}

/**
 * Answers each upstream call by its endpoint, for lookups that call more than
 * one: a city list reads availability and `city/search` together.
 */
function route(handlers: {
  availability?: (url: URL) => unknown
  citySearch?: (url: URL) => unknown
}) {
  fetchMock.mockImplementation((input: string | URL) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/residential_availability/search')) {
      return jsonResponse(handlers.availability?.(url) ?? availability([]))
    }
    if (url.pathname.endsWith('/city/search')) {
      return jsonResponse(handlers.citySearch?.(url) ?? { data: [] })
    }
    throw new Error(`unexpected upstream call: ${url}`)
  })
}

/** The URLs of the upstream calls made to one endpoint. */
function callsTo(endpoint: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith(`/${endpoint}`))
}

/**
 * Asserts the thrown value is an `AppError` carrying `code`.
 *
 * It checks `name` rather than using `instanceof`: each test loads a fresh
 * module graph, so the class the client throws is not the same object as the
 * one this file would import.
 */
async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: 'AppError', code })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('BYTEFUL_PUBLIC_KEY', 'public-key')
  vi.stubEnv('BYTEFUL_PRIVATE_KEY', 'private-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('credentials', () => {
  it('sends both keys as headers and never in the URL', async () => {
    fetchMock.mockImplementation(() => jsonResponse(countries([['gb', 'UK', 10]])))

    const { searchCountries } = await loadClient()
    await searchCountries()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).not.toContain('public-key')
    expect(init.headers).toMatchObject({
      'X-API-Public-Key': 'public-key',
      'X-API-Private-Key': 'private-key',
    })
  })

  it('reports server_misconfigured when the keys are absent', async () => {
    vi.stubEnv('BYTEFUL_PUBLIC_KEY', '')
    vi.stubEnv('BYTEFUL_PRIVATE_KEY', '')

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'server_misconfigured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the error table', () => {
  it.each([
    [401, 'server_misconfigured'],
    [403, 'server_misconfigured'],
    [500, 'upstream_error'],
    [404, 'upstream_error'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockImplementation(() => jsonResponse({ api_request_id: 'req-1' }, status))

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), code as ErrorCode)
  })

  it('retries a 429 once, then reports lookup_unavailable', async () => {
    fetchMock.mockImplementation(() => jsonResponse({}, 429))

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'lookup_unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('succeeds when the retry after a 429 works', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(countries([['gb', 'UK', 10]])))

    const { searchCountries } = await loadClient()
    await expect(searchCountries()).resolves.toEqual([
      { id: 'gb', name: 'UK', nodeCount: 10 },
    ])
  })

  /**
   * The default wait is 1s, so a `Retry-After: 0` that retries in well under
   * that proves the header is being read rather than ignored.
   */
  it('waits for the time Retry-After asks for instead of a fixed delay', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(jsonResponse(countries([['gb', 'UK', 10]])))

    const { searchCountries } = await loadClient()
    const startedAt = Date.now()
    await expect(searchCountries()).resolves.toHaveLength(1)

    expect(Date.now() - startedAt).toBeLessThan(500)
  })

  /**
   * Byteful's real 429s carry no `Retry-After` at all. `Number(null)` is 0,
   * so without a guard the retry fired instantly into the same rate-limited
   * second; this pins the one-second default for that case.
   */
  it('waits the default when a 429 has no Retry-After, as Byteful sends', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: '20 per 1 second' }, 429))
      .mockResolvedValueOnce(jsonResponse(countries([['gb', 'UK', 10]])))

    const { searchCountries } = await loadClient()
    const startedAt = Date.now()
    await expect(searchCountries()).resolves.toHaveLength(1)

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
  })

  it('ignores a nonsense Retry-After and falls back to the default', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response('{}', {
          status: 429,
          headers: { 'Retry-After': 'next tuesday' },
        }),
    )

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'lookup_unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports lookup_unavailable when the connection fails or times out', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'))

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'lookup_unavailable')
  })

  it('reports upstream_invalid_response when the shape is wrong', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [{ nope: true }] }))

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'upstream_invalid_response')
  })

  it('reports upstream_invalid_response when the body is not JSON', async () => {
    fetchMock.mockImplementation(() => new Response('<html>oops</html>'))

    const { searchCountries } = await loadClient()
    await expectCode(searchCountries(), 'upstream_invalid_response')
  })

  it('keeps Byteful api_request_id out of the client-facing message', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ api_request_id: 'req-42' }, 500))

    const { searchCountries } = await loadClient()
    await searchCountries().catch((err: AppError) => {
      expect(err.message).not.toContain('req-42')
      expect(err.logContext?.api_request_id).toBe('req-42')
    })
  })
})

describe('searchCountries', () => {
  it('reads live availability grouped by country, in one call', async () => {
    route({ availability: () => countries([['gb', 'UK', 5]]) })

    const { searchCountries } = await loadClient()
    await searchCountries()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(callsTo('residential_availability/search')[0].searchParams.get('group_by')).toBe('country')
  })

  it('drops countries with no live nodes, lowercases ids and sorts by name', async () => {
    route({
      availability: () =>
        countries([
          ['GB', 'UK', 5],
          ['sg', 'Singapore', 0],
          ['at', 'Austria', 2],
        ]),
    })

    const { searchCountries } = await loadClient()
    await expect(searchCountries()).resolves.toEqual([
      { id: 'at', name: 'Austria', nodeCount: 2 },
      { id: 'gb', name: 'UK', nodeCount: 5 },
    ])
  })
})

describe('searchCities', () => {
  /** A `city/search` row: the alias and subdivision availability lacks. */
  const cityInfo = (city_id: number, city_alias: string, subdivision_id: string) => ({
    city_id,
    city_alias,
    city_name: city_alias,
    subdivision_id,
  })

  it('joins live cities to their aliases on city_id, busiest first', async () => {
    route({
      availability: () =>
        availability([
          { city_id: 1, city_name: 'Albany', residential_availability_node_count: 10 },
          { city_id: 2, city_name: 'Albany', residential_availability_node_count: 99 },
        ]),
      citySearch: () => ({
        data: [cityInfo(1, 'us_ga_albany', 'us-ga'), cityInfo(2, 'us_ny_albany', 'us-ny')],
      }),
    })

    const { searchCities } = await loadClient()
    await expect(searchCities({ countryId: 'us' })).resolves.toEqual([
      { id: 2, alias: 'us_ny_albany', name: 'Albany', nodeCount: 99, subdivision: 'NY' },
      { id: 1, alias: 'us_ga_albany', name: 'Albany', nodeCount: 10, subdivision: 'GA' },
    ])
  })

  it('drops, and logs, a live city with no alias to target it by', async () => {
    route({
      availability: () =>
        availability([
          { city_id: 1, city_name: 'Known', residential_availability_node_count: 5 },
          { city_id: 2, city_name: 'Unknown', residential_availability_node_count: 5 },
        ]),
      citySearch: () => ({ data: [cityInfo(1, 'known', 'gb-lnd')] }),
    })

    const { searchCities } = await loadClient()
    const cities = await searchCities({ countryId: 'gb' })

    expect(cities.map((city) => city.alias)).toEqual(['known'])
    expect(console.error).toHaveBeenCalled()
  })

  it('asks availability for the country grouped by city', async () => {
    route({})

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    const url = callsTo('residential_availability/search')[0]
    expect(url.searchParams.get('country_id')).toBe('gb')
    expect(url.searchParams.get('group_by')).toBe('city')
  })

  it('reads aliases by the country prefix of subdivision_id', async () => {
    route({})

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    const url = callsTo('city/search')[0]
    // Encoded exactly once: `gb%2525` would match nothing.
    expect(url.search).toContain('like_subdivision_id=gb%25')
    expect(url.search).not.toContain('gb%2525')
    // Byteful ignores country_id on this endpoint and would return the world.
    expect(url.searchParams.has('country_id')).toBe(false)
    expect(url.searchParams.get('min_city_node_count')).toBe('1')
    // 1001 is rejected with "Search per_page parameter is limited to 1000".
    expect(url.searchParams.get('per_page')).toBe('1000')
  })

  it('reads every page of aliases the reported total implies', async () => {
    route({
      citySearch: (url) => ({
        data: [cityInfo(Number(url.searchParams.get('page')), 'c', 'cn-bj')],
        per_page: 1_000,
        // 1,191 cities, as China has without a node floor: two pages.
        total_count: 1_191,
      }),
    })

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'cn' })

    expect(callsTo('city/search')).toHaveLength(2)
  })
})

describe('searchAsns', () => {
  it('reads the worldwide list in one call, with no location filter', async () => {
    route({})

    const { searchAsns } = await loadClient()
    await searchAsns({})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = callsTo('residential_availability/search')[0]
    expect(url.searchParams.get('group_by')).toBe('asn')
    expect(url.searchParams.has('country_id')).toBe(false)
    expect(url.searchParams.has('city_id')).toBe(false)
  })

  /**
   * By `city_id`, not the documented `city_name`: names repeat within a
   * country, and the US alone has five Lakewoods.
   */
  it('narrows to a city by its id', async () => {
    route({})

    const { searchAsns } = await loadClient()
    await searchAsns({ countryId: 'gb', cityId: 380781 })

    const url = callsTo('residential_availability/search')[0]
    expect(url.searchParams.get('country_id')).toBe('gb')
    expect(url.searchParams.get('city_id')).toBe('380781')
    expect(url.searchParams.has('city_name')).toBe(false)
  })

  it('narrows rows, drops ASNs with no live nodes and sorts busiest first', async () => {
    route({
      availability: () =>
        availability([
          { asn_id: 37094, asn_name: 'Orange Liberia Inc', residential_availability_node_count: 3 },
          { asn_id: 14593, asn_name: 'Space Exploration Technologies Corporation', residential_availability_node_count: 39 },
          { asn_id: 37203, asn_name: 'Liberia Telecommunications Corporation', residential_availability_node_count: 0 },
        ]),
    })

    const { searchAsns } = await loadClient()
    await expect(searchAsns({ countryId: 'lr' })).resolves.toEqual([
      { id: 14593, name: 'Space Exploration Technologies Corporation', nodeCount: 39 },
      { id: 37094, name: 'Orange Liberia Inc', nodeCount: 3 },
    ])
  })
})

describe('the server-side cache', () => {
  it('serves a repeated identical search from memory', async () => {
    route({})

    const { searchAsns } = await loadClient()
    await searchAsns({ countryId: 'gb' })
    await searchAsns({ countryId: 'gb' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys worldwide, country and city ASN lists apart', async () => {
    route({})

    const { searchAsns } = await loadClient()
    await searchAsns({})
    await searchAsns({ countryId: 'gb' })
    await searchAsns({ countryId: 'gb', cityId: 1 })
    await searchAsns({})

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keys cities on the country alone', async () => {
    route({})

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })
    await searchCities({ countryId: 'gb' })
    await searchCities({ countryId: 'de' })

    expect(callsTo('residential_availability/search')).toHaveLength(2)
    expect(callsTo('city/search')).toHaveLength(2)
  })

  it('collapses concurrent identical searches into one upstream call', async () => {
    route({})

    const { searchAsns } = await loadClient()
    await Promise.all([
      searchAsns({ countryId: 'gb' }),
      searchAsns({ countryId: 'gb' }),
      searchAsns({ countryId: 'gb' }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(availability([])))

    const { searchAsns } = await loadClient()
    await expectCode(searchAsns({ countryId: 'gb' }), 'upstream_error')
    await expect(searchAsns({ countryId: 'gb' })).resolves.toEqual([])
  })
})
