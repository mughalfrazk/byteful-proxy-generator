import { z } from 'zod'

import {
  availabilityNodeCount,
  availabilityResponseSchema,
  searchResponseSchema,
} from './common'

/**
 * A `city/search` row, read only for what availability lacks: the alias the
 * username needs, and the ISO 3166-2 `subdivision_id` (`gb-lnd`).
 */
export const BytefulCitySchema = z.looseObject({
  city_id: z.number().int().positive(),
  city_alias: z.string(),
  city_name: z.string(),
  subdivision_id: z.string().nullish(),
})

export const BytefulCitySearchSchema = searchResponseSchema(BytefulCitySchema)

/** A `residential_availability/search?group_by=city` row. */
export const BytefulCityAvailabilitySchema = z.looseObject({
  city_id: z.number().int().positive(),
  city_name: z.string(),
  residential_availability_node_count: availabilityNodeCount,
})

export const BytefulCityAvailabilityResponseSchema = availabilityResponseSchema(
  BytefulCityAvailabilitySchema,
)

export type City = {
  /** Byteful's `city_id`, which the ASN lookup filters on. */
  id: number
  alias: string
  name: string
  nodeCount: number
  /** `NY` from `us-ny`, to tell apart cities with the same name. */
  subdivision: string
}

export function narrowCity(
  live: z.infer<typeof BytefulCityAvailabilitySchema>,
  info: z.infer<typeof BytefulCitySchema>,
): City {
  return {
    id: live.city_id,
    alias: info.city_alias,
    name: live.city_name,
    nodeCount: live.residential_availability_node_count,
    subdivision: (info.subdivision_id?.split('-')[1] ?? '').toUpperCase(),
  }
}
