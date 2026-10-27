'use client'

import useSWR, { type SWRConfiguration } from 'swr'

import type { Asn, City, Country } from '@/lib/models'

type LookupResponse<T> = { data: T[] }

export type LookupResult<T> = {
  options: T[]
  isLoading: boolean
  /**
   * True while any request for this lookup is in flight, including a
   * revalidation that is serving stale data. Callers deciding whether a list is
   * genuinely empty must wait for this to settle, otherwise they would read
   * "no options yet" as "no options exist".
   */
  isValidating: boolean
  error: Error | undefined
  retry: () => void
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** A `null` key is how SWR is told not to fetch. */
function useLookup<T>(
  key: string | null,
  config?: SWRConfiguration<LookupResponse<T>>,
): LookupResult<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    LookupResponse<T>
  >(key, { keepPreviousData: true, ...config })

  return {
    options: data?.data ?? [],
    isLoading,
    isValidating,
    error,
    retry: () => void mutate(),
  }
}

/**
 * Countries load once and are filtered in the browser, so revalidating a
 * stale cache entry would only cause a flicker for data that barely changes.
 */
export function useCountries(): LookupResult<Country> {
  return useLookup<Country>('/api/lookup/country', {
    revalidateIfStale: false,
  })
}

/**
 * Every city in the country, fetched once per country and filtered in the
 * browser. Without a country there is nothing to fetch, so the key is `null`.
 */
export function useCities(countryId: string | undefined): LookupResult<City> {
  return useLookup<City>(
    countryId
      ? `/api/lookup/city${buildQuery({ country_id: countryId })}`
      : null,
    { revalidateIfStale: false },
  )
}

/**
 * ASN targeting works with or without a country, so this loads on mount and
 * re-narrows whenever the country changes. Loading it up front is what lets the
 * field show "No ASNs available" before the user opens it.
 */
export function useAsns(countryId: string | undefined): LookupResult<Asn> {
  return useLookup<Asn>(
    `/api/lookup/asn${buildQuery({ country_id: countryId })}`,
    { revalidateIfStale: false },
  )
}
