'use client'

import { useEffect, useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'

import {
  useAsns,
  useCities,
  useCountries,
  type LookupResult,
} from '@/hooks/useLookup'
import { RequestError } from '@/lib/fetcher'
import { formatNodeCount } from '@/lib/format'
import type { ListRequestInput } from '@/lib/models/residential'

import { Field } from './Field'
import { LocationCombobox, type ComboboxOption } from './LocationCombobox'

/** A missing or rejected API key won't fix itself, so it gets no Retry. */
function canRetry(error: Error): boolean {
  return !(error instanceof RequestError && error.code === 'server_misconfigured')
}

export function TargetingFields({
  form,
}: {
  form: UseFormReturn<ListRequestInput, unknown, unknown>
}) {
  const { errors } = form.formState
  const [countryId, cityAlias, asnId] = useWatch({
    control: form.control,
    name: ['country_id', 'city_alias', 'asn_id'],
  })

  // Lists arrive whole and are searched in the browser, so typing never
  // reaches the network and needs no debounce.
  const countries = useCountries()
  const cities = useCities(countryId)

  // The form holds the alias; the ASN lookup needs the `city_id`.
  const cityId = cities.options.find((city) => city.alias === cityAlias)?.id
  const asns = useAsns(countryId, cityId)

  // Settled and empty. Not on error, so the retry button stays reachable.
  function isEmptyLookup(lookup: {
    options: unknown[]
    isLoading: boolean
    isValidating: boolean
    error?: Error
  }): boolean {
    return (
      !lookup.isLoading &&
      !lookup.isValidating &&
      !lookup.error &&
      lookup.options.length === 0
    )
  }

  // One line on the field: what failed and what to do. The open list shows
  // the server's detail and the Retry button.
  function lookupError(
    lookup: { error?: Error },
    what: string,
  ): string | undefined {
    if (!lookup.error) return undefined
    return canRetry(lookup.error)
      ? `Couldn't load ${what}. Retry from the list.`
      : `Couldn't load ${what}. The server is not set up correctly; contact the administrator.`
  }

  function retryFor(lookup: LookupResult<unknown>): (() => void) | undefined {
    return lookup.error && !canRetry(lookup.error) ? undefined : lookup.retry
  }

  const noCities = Boolean(countryId) && isEmptyLookup(cities)
  const noAsns = isEmptyLookup(asns)

  const countryOptions: ComboboxOption[] = countries.options.map((country) => ({
    value: country.id,
    label: country.name,
    nodeCount: country.nodeCount,
  }))

  // Repeated names (Albany NY, GA, OR) get their subdivision; others stay bare.
  const duplicateCityNames = new Set(
    cities.options
      .map((city) => city.name)
      .filter((name, index, names) => names.indexOf(name) !== index),
  )

  const cityOptions: ComboboxOption[] = cities.options.map((city) => ({
    value: city.alias,
    label:
      duplicateCityNames.has(city.name) && city.subdivision
        ? `${city.name} (${city.subdivision})`
        : city.name,
    nodeCount: city.nodeCount,
  }))

  const asnOptions: ComboboxOption[] = asns.options.map((asn) => ({
    value: String(asn.id),
    label: asn.name,
    // `AS7922` is how ASNs are usually written; `7922` still matches it.
    detail: `AS${asn.id}`,
    nodeCount: asn.nodeCount,
  }))

  const asnNodeTotal = asns.options.reduce((sum, asn) => sum + asn.nodeCount, 0)

  // The ASN the user picked. The form holds it only while the country and
  // city offer it: picking Starlink and then Liberia keeps it, and a country
  // without it leaves it out with a note. While the list loads, it stays.
  const [pickedAsn, setPickedAsn] = useState<number>()
  const asnUnavailable =
    pickedAsn !== undefined &&
    !asns.isLoading &&
    !asns.isValidating &&
    !asns.error &&
    !asns.options.some((asn) => asn.id === pickedAsn)
  const effectiveAsn = asnUnavailable ? undefined : pickedAsn

  // The form is the request, so it follows the pick.
  useEffect(() => {
    if (form.getValues('asn_id') === effectiveAsn) return
    form.setValue('asn_id', effectiveAsn, { shouldValidate: true })
  }, [effectiveAsn, form])

  // A new country invalidates the city picked for the old one.
  function handleCountryChange(value: string | undefined) {
    form.setValue('country_id', value, { shouldValidate: true })
    form.setValue('city_alias', undefined, { shouldValidate: true })
  }

  function handleCityChange(value: string | undefined) {
    form.setValue('city_alias', value, { shouldValidate: true })
  }

  function handleAsnChange(value: string | undefined) {
    setPickedAsn(value === undefined ? undefined : Number(value))
  }

  function asnDescription(): string {
    const area = cityAlias ? 'city' : 'country'

    if (asnUnavailable) {
      return `AS${pickedAsn} has no nodes in this ${area}, so it is left out. Pick another ASN or change the ${area}.`
    }
    if (noAsns) {
      return cityAlias
        ? 'No ASNs for this city. Clear the city to see the whole country.'
        : 'No ASNs for this country. Clear the country to search all ASNs.'
    }
    if (cityAlias) return 'Limited to the selected city.'
    if (countryId) return 'Limited to the selected country.'
    return 'Works with or without a country.'
  }

  return (
    <>
      <Field
        id="country_id"
        label="Country"
        error={errors.country_id?.message ?? lookupError(countries, 'countries')}
        description="Countries with available nodes."
      >
        <LocationCombobox
          id="country_id"
          label="Country"
          placeholder="Any country"
          searchPlaceholder="Search countries…"
          options={countryOptions}
          value={countryId}
          onChange={handleCountryChange}
          isLoading={countries.isLoading}
          error={countries.error}
          onRetry={retryFor(countries)}
          emptyLabel={(search) =>
            search ? `No countries match “${search}”` : 'No countries available'
          }
        />
      </Field>

      <Field
        id="city_alias"
        label="City"
        error={errors.city_alias?.message ?? lookupError(cities, 'cities')}
        description={
          !countryId
            ? 'Choose a country first.'
            : noCities
              ? 'No cities available for this country.'
              : 'Sorted by available nodes. Type to search.'
        }
      >
        <LocationCombobox
          id="city_alias"
          label="City"
          placeholder={
            !countryId
              ? 'Choose a country first'
              : noCities
                ? 'No cities available'
                : 'Any city'
          }
          searchPlaceholder="Search cities…"
          options={cityOptions}
          value={cityAlias}
          onChange={handleCityChange}
          isLoading={cities.isLoading}
          error={cities.error}
          onRetry={retryFor(cities)}
          disabled={!countryId || noCities}
          emptyLabel={(search) =>
            search ? `No cities match “${search}”` : 'No cities available'
          }
        />
      </Field>

      <Field
        id="asn_id"
        label="ASN"
        // Hidden while loading or failed, so it never reads as a real 0.
        labelChip={
          asnNodeTotal > 0 ? formatNodeCount(asnNodeTotal) : undefined
        }
        error={errors.asn_id?.message ?? lookupError(asns, 'ASNs')}
        description={asnDescription()}
      >
        <LocationCombobox
          id="asn_id"
          label="ASN"
          placeholder={noAsns ? 'No ASNs available' : 'Any ASN'}
          searchPlaceholder="Search ASNs…"
          options={asnOptions}
          value={asnId === undefined ? undefined : String(asnId)}
          onChange={handleAsnChange}
          isLoading={asns.isLoading}
          error={asns.error}
          onRetry={retryFor(asns)}
          disabled={noAsns}
          emptyLabel={(search) =>
            search ? `No ASNs match “${search}”` : 'No ASNs available'
          }
        />
      </Field>
    </>
  )
}
