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

function countryPage(
  countries: Array<[string, string, number]>,
  pagination?: { per_page?: number; total_count?: number },
) {
  return {
    data: countries.map(([country_id, country_name, country_node_count]) => ({
      country_id,
      country_name,
      country_node_count,
    })),
    page: 1,
    per_page: pagination?.per_page ?? 100,
    item_count: countries.length,
    total_count: pagination?.total_count ?? countries.length,
  }
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
    fetchMock.mockImplementation(() => jsonResponse(countryPage([['gb', 'UK', 10]])))

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
      .mockResolvedValueOnce(jsonResponse(countryPage([['gb', 'UK', 10]])))

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
      .mockResolvedValueOnce(jsonResponse(countryPage([['gb', 'UK', 10]])))

    const { searchCountries } = await loadClient()
    const startedAt = Date.now()
    await expect(searchCountries()).resolves.toHaveLength(1)

    expect(Date.now() - startedAt).toBeLessThan(500)
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
  it('merges every page the reported total implies', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          countryPage([['gb', 'UK', 5]], { per_page: 100, total_count: 250 }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(countryPage([['de', 'Germany', 7]])))
      .mockResolvedValueOnce(jsonResponse(countryPage([['at', 'Austria', 2]])))

    const { searchCountries } = await loadClient()
    const countries = await searchCountries()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(countries.map((country) => country.name)).toEqual([
      'Austria',
      'Germany',
      'UK',
    ])
  })

  it('stops at one page when the total fits in it', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(
        countryPage([['gb', 'UK', 5]], { per_page: 100, total_count: 1 }),
      ),
    )

    const { searchCountries } = await loadClient()
    await searchCountries()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks Byteful for only the countries that have nodes', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(countryPage([['gb', 'UK', 5]])),
    )

    const { searchCountries } = await loadClient()
    await searchCountries()

    expect(fetchMock.mock.calls[0][0]).toContain('min_country_node_count=1')
  })
})

describe('query strings', () => {
  it('filters cities by the country prefix of subdivision_id', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('like_subdivision_id=gb%25')
    // Byteful ignores country_id on this endpoint and would return the world.
    expect(url).not.toContain('country_id=gb')
  })

  it('encodes the SQL wildcard exactly once', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('gb%2525')
  })

  it('sorts by node count, which Byteful orders descending by default', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('sort_by=city_node_count')
    // A leading "-" means ascending, which would surface the emptiest cities.
    expect(url).not.toContain('sort_by=-city_node_count')
  })

  /**
   * Cities are bounded per country, so the whole list is fetched and filtered
   * in the browser. Nothing should ever narrow it upstream by name.
   */
  it('never filters cities by name upstream', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('like_city_name')
  })

  it('requests cities at the per_page ceiling Byteful allows', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    // 1001 is rejected with "Search per_page parameter is limited to 1000".
    expect(String(fetchMock.mock.calls[0][0])).toContain('per_page=1000')
  })

  /**
   * Byteful reports `city_node_count: 0` for the only city in some countries
   * that do have nodes (Singapore), so a floor of 1 emptied those dropdowns.
   * The floor stays on countries and ASNs, where it behaves.
   */
  it('sets no node-count floor on cities, unlike countries and ASNs', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities, searchAsns } = await loadClient()

    await searchCities({ countryId: 'sg' })
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(
      'min_city_node_count',
    )

    await searchAsns({ countryId: 'sg' })
    expect(String(fetchMock.mock.calls[1][0])).toContain('min_asn_node_count=1')
  })

  it('omits country_id for an ASN search with no country', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchAsns } = await loadClient()
    await searchAsns({ query: 'virgin' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).not.toContain('country_id')
    expect(url).toContain('like_asn_name=%25virgin%25')
  })

  it('fetches every page of cities, not just the first', async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const page = new URL(String(input)).searchParams.get('page')
      return jsonResponse({
        data: [
          {
            city_alias: `city_${page}`,
            city_name: `City ${page}`,
            city_node_count: 1,
            subdivision_id: 'cn-bj',
          },
        ],
        page: Number(page),
        per_page: 1_000,
        item_count: 1,
        // 1,191 cities, as China actually has: two pages, not one.
        total_count: 1_191,
      })
    })

    const { searchCities } = await loadClient()
    const cities = await searchCities({ countryId: 'cn' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cities.map((city) => city.alias)).toEqual(['city_1', 'city_2'])
  })

  it('narrows a city row, deriving the subdivision that disambiguates it', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        data: [
          {
            city_alias: 'us_ga_albany',
            city_name: 'Albany',
            city_node_count: 535,
            subdivision_id: 'us-ga',
          },
        ],
      }),
    )

    const { searchCities } = await loadClient()
    await expect(searchCities({ countryId: 'us' })).resolves.toEqual([
      {
        alias: 'us_ga_albany',
        name: 'Albany',
        nodeCount: 535,
        subdivision: 'GA',
      },
    ])
  })

  it('sorts cities by node count across stitched-together pages', async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const page = new URL(String(input)).searchParams.get('page')
      // Page 2 arrives holding the busiest city, so returning the pages in
      // order would put it last.
      const rows =
        page === '1'
          ? [['a', 'A', 10] as const]
          : [['b', 'B', 99] as const]

      return jsonResponse({
        data: rows.map(([city_alias, city_name, city_node_count]) => ({
          city_alias,
          city_name,
          city_node_count,
          subdivision_id: 'gb-lnd',
        })),
        page: Number(page),
        per_page: 1_000,
        item_count: 1,
        total_count: 1_500,
      })
    })

    const { searchCities } = await loadClient()
    const cities = await searchCities({ countryId: 'gb' })

    expect(cities.map((city) => city.name)).toEqual(['B', 'A'])
  })

  it('narrows an ASN row to the fields the app uses', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        data: [
          {
            asn_id: 5089,
            asn_name: 'Virgin Media Limited',
            asn_node_count: 83576,
            asn_rir: 'ripe',
            country_id: 'gb',
          },
        ],
      }),
    )

    const { searchAsns } = await loadClient()
    await expect(searchAsns({})).resolves.toEqual([
      { id: 5089, name: 'Virgin Media Limited', nodeCount: 83576 },
    ])
  })
})

describe('the server-side cache', () => {
  it('serves a repeated identical search from memory', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchAsns } = await loadClient()
    await searchAsns({ countryId: 'gb', query: 'virgin' })
    await searchAsns({ countryId: 'gb', query: 'virgin' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys on the query, so a different search still goes upstream', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchAsns } = await loadClient()
    await searchAsns({ countryId: 'gb', query: 'virgin' })
    await searchAsns({ countryId: 'gb', query: 'sky' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keys cities on the country alone', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })
    await searchCities({ countryId: 'gb' })
    await searchCities({ countryId: 'de' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('collapses concurrent identical searches into one upstream call', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await Promise.all([
      searchCities({ countryId: 'gb' }),
      searchCities({ countryId: 'gb' }),
      searchCities({ countryId: 'gb' }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await expectCode(searchCities({ countryId: 'gb' }), 'upstream_error')
    await expect(searchCities({ countryId: 'gb' })).resolves.toEqual([])
  })
})
