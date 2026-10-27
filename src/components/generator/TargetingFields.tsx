'use client'

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAsns, useCities, useCountries } from '@/hooks/useLookup'
import type { ListRequestInput } from '@/lib/models/residential'

import { Field } from './Field'
import { LocationCombobox, type ComboboxOption } from './LocationCombobox'

const DEBOUNCE_MS = 300

export function TargetingFields({
  form,
}: {
  form: UseFormReturn<ListRequestInput, unknown, unknown>
}) {
  const { errors } = form.formState
  const countryId = form.watch('country_id')
  const cityAlias = form.watch('city_alias')
  const asnId = form.watch('asn_id')

  const [citySearch, setCitySearch] = useState('')
  const [asnSearch, setAsnSearch] = useState('')

  const debouncedCitySearch = useDebouncedValue(citySearch, DEBOUNCE_MS)
  const debouncedAsnSearch = useDebouncedValue(asnSearch, DEBOUNCE_MS)

  const countries = useCountries()
  const cities = useCities(countryId, debouncedCitySearch)
  const asns = useAsns(countryId, debouncedAsnSearch)

  const countryOptions: ComboboxOption[] = countries.options.map((country) => ({
    value: country.id,
    label: country.name,
    nodeCount: country.nodeCount,
  }))

  const cityOptions: ComboboxOption[] = cities.options.map((city) => ({
    value: city.alias,
    label: city.name,
    nodeCount: city.nodeCount,
  }))

  const asnOptions: ComboboxOption[] = asns.options.map((asn) => ({
    value: String(asn.id),
    label: `AS${asn.id} — ${asn.name}`,
    nodeCount: asn.nodeCount,
  }))

  /**
   * Changing or clearing the country invalidates both dependent selections, so
   * they are cleared here rather than left to go stale. A city alias from the
   * previous country would otherwise still be in the form when it is no longer
   * a valid combination.
   */
  function handleCountryChange(value: string | undefined) {
    form.setValue('country_id', value, { shouldValidate: true })
    form.setValue('city_alias', undefined, { shouldValidate: true })
    form.setValue('asn_id', undefined, { shouldValidate: true })
    setCitySearch('')
    setAsnSearch('')
  }

  return (
    <>
      <Field
        id="country_id"
        label="Country"
        error={errors.country_id?.message}
        description="Countries with no available nodes are hidden."
      >
        <LocationCombobox
          id="country_id"
          label="Country"
          placeholder="Any country"
          searchPlaceholder="Search countries…"
          options={countryOptions}
          value={countryId}
          onChange={handleCountryChange}
          filterLocally
          isLoading={countries.isLoading}
          error={countries.error}
          onRetry={countries.retry}
          emptyLabel={(search) =>
            search ? `No countries match “${search}”` : 'No countries available'
          }
        />
      </Field>

      <Field
        id="city_alias"
        label="City"
        error={errors.city_alias?.message}
        description={
          countryId
            ? 'Sorted by available nodes. Type to search.'
            : 'Choose a country first.'
        }
      >
        <LocationCombobox
          id="city_alias"
          label="City"
          placeholder={countryId ? 'Any city' : 'Choose a country first'}
          searchPlaceholder="Search cities…"
          options={cityOptions}
          value={cityAlias}
          onChange={(value) =>
            form.setValue('city_alias', value, { shouldValidate: true })
          }
          // Server-side search: the city list is far too large to hold in the
          // browser and filter there.
          search={citySearch}
          onSearchChange={setCitySearch}
          isLoading={cities.isLoading}
          error={cities.error}
          onRetry={cities.retry}
          disabled={!countryId}
          emptyLabel={(search) =>
            search ? `No cities match “${search}”` : 'No cities available'
          }
        />
      </Field>

      <Field
        id="asn_id"
        label="ASN"
        error={errors.asn_id?.message}
        description={
          countryId
            ? 'Limited to the selected country.'
            : 'Works with or without a country.'
        }
      >
        <LocationCombobox
          id="asn_id"
          label="ASN"
          placeholder="Any ASN"
          searchPlaceholder="Search ASNs…"
          options={asnOptions}
          value={asnId === undefined ? undefined : String(asnId)}
          onChange={(value) =>
            form.setValue(
              'asn_id',
              value === undefined ? undefined : Number(value),
              { shouldValidate: true },
            )
          }
          search={asnSearch}
          onSearchChange={setAsnSearch}
          isLoading={asns.isLoading}
          error={asns.error}
          onRetry={asns.retry}
          emptyLabel={(search) =>
            search ? `No ASNs match “${search}”` : 'No ASNs available'
          }
        />
      </Field>
    </>
  )
}
