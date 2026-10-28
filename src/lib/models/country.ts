import { z } from 'zod'

import { availabilityNodeCount, availabilityResponseSchema } from './common'

/** A `residential_availability/search?group_by=country` row. */
export const BytefulCountryAvailabilitySchema = z.looseObject({
  country_id: z.string(),
  country_name: z.string(),
  residential_availability_node_count: availabilityNodeCount,
})

export const BytefulCountryAvailabilityResponseSchema =
  availabilityResponseSchema(BytefulCountryAvailabilitySchema)

export type Country = {
  id: string
  name: string
  nodeCount: number
}

/** Keeps only the fields the app uses. */
export function narrowCountry(
  raw: z.infer<typeof BytefulCountryAvailabilitySchema>,
): Country {
  return {
    id: raw.country_id.toLowerCase(),
    name: raw.country_name,
    nodeCount: raw.residential_availability_node_count,
  }
}
