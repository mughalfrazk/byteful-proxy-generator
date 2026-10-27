'use client'

import useSWR from 'swr'

import type { Asn, City, Country } from '@/lib/models'

type LookupResponse<T> = { data: T[] }

export type LookupResult<T> = {
  options: T[]
  isLoading: boolean
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

function useLookup<T>(key: string | null): LookupResult<T> {
  const { data, error, isLoading, mutate } = useSWR<LookupResponse<T>>(key, {
    keepPreviousData: true,
  })

  return {
    options: data?.data ?? [],
    isLoading,
    error,
    retry: () => void mutate(),
  }
}

/**
 * Countries load once and are filtered in the browser, so revalidating a
 * stale cache entry would only cause a flicker for data that barely changes.
 */
export function useCountries(): LookupResult<Country> {
  const { data, error, isLoading, mutate } = useSWR<LookupResponse<Country>>(
    '/api/lookup/country',
    { revalidateIfStale: false, keepPreviousData: true },
  )

  return {
    options: data?.data ?? [],
    isLoading,
    error,
    retry: () => void mutate(),
  }
}

/** The key is `null` until a country is chosen, which keeps SWR from fetching. */
export function useCities(
  countryId: string | undefined,
  query: string,
): LookupResult<City> {
  return useLookup<City>(
    countryId
      ? `/api/lookup/city${buildQuery({ country_id: countryId, query })}`
      : null,
  )
}

export function useAsns(
  countryId: string | undefined,
  query: string,
): LookupResult<Asn> {
  return useLookup<Asn>(
    `/api/lookup/asn${buildQuery({ country_id: countryId, query })}`,
  )
}
