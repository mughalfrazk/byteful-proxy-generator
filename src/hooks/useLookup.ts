'use client'

import useSWR, { type SWRConfiguration } from 'swr'

import type { Asn, City, Country, LookupResponse } from '@/lib/models'

export type LookupResult<T> = {
  options: T[]
  isLoading: boolean
  /** Any request in flight, including revalidation. Wait for it before calling a list empty. */
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

/**
 * A `null` key skips the fetch. No `keepPreviousData`: it would offer the
 * previous country's cities while the new ones load (France + Berlin).
 */
function useLookup<T>(
  key: string | null,
  config?: SWRConfiguration<LookupResponse<T>>,
): LookupResult<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    LookupResponse<T>
  >(key, config)

  return {
    options: data?.data ?? [],
    isLoading,
    isValidating,
    error,
    retry: () => void mutate(),
  }
}

/** Loaded once and filtered in the browser. */
export function useCountries(): LookupResult<Country> {
  return useLookup<Country>('/api/lookup/country', {
    revalidateIfStale: false,
  })
}

/** Loaded once per country and filtered in the browser. */
export function useCities(countryId: string | undefined): LookupResult<City> {
  return useLookup<City>(
    countryId
      ? `/api/lookup/city${buildQuery({ country_id: countryId })}`
      : null,
    { revalidateIfStale: false },
  )
}

/** Works without a country, so it loads on mount and narrows to the country or city. */
export function useAsns(
  countryId: string | undefined,
  cityId: number | undefined,
): LookupResult<Asn> {
  return useLookup<Asn>(
    `/api/lookup/asn${buildQuery({ country_id: countryId, city_id: cityId })}`,
    { revalidateIfStale: false },
  )
}
