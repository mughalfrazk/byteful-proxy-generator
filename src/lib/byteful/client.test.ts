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

  it('wraps a city query in SQL-style wildcards', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb', query: 'lon' })

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'like_city_name=%25lon%25',
    )
  })

  it('omits the city query parameter entirely when there is no query', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb' })

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('like_city_name')
  })

  it('omits country_id for an ASN search with no country', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchAsns } = await loadClient()
    await searchAsns({ query: 'virgin' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).not.toContain('country_id')
    expect(url).toContain('like_asn_name=%25virgin%25')
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

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb', query: 'lon' })
    await searchCities({ countryId: 'gb', query: 'lon' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys on the query, so a different search still goes upstream', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await searchCities({ countryId: 'gb', query: 'lon' })
    await searchCities({ countryId: 'gb', query: 'man' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('collapses concurrent identical searches into one upstream call', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await Promise.all([
      searchCities({ countryId: 'gb', query: 'lon' }),
      searchCities({ countryId: 'gb', query: 'lon' }),
      searchCities({ countryId: 'gb', query: 'lon' }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))

    const { searchCities } = await loadClient()
    await expectCode(
      searchCities({ countryId: 'gb', query: 'lon' }),
      'upstream_error',
    )
    await expect(
      searchCities({ countryId: 'gb', query: 'lon' }),
    ).resolves.toEqual([])
  })
})
