import { z } from 'zod'

import { searchResponseSchema } from './common'

/** The upstream shape of `GET /1.0/public/user/country/search`. */
export const BytefulCountrySchema = z.looseObject({
  country_id: z.string(),
  country_name: z.string(),
  country_node_count: z.number().int().nonnegative().nullish(),
})

export const BytefulCountrySearchSchema = searchResponseSchema(
  BytefulCountrySchema,
)

/** The app shape. A plain type, not a schema: nothing re-parses our own output. */
export type Country = {
  id: string
  name: string
  nodeCount: number
}

/** Keeps only the fields the app uses, so new upstream fields can't leak through. */
export function narrowCountry(
  raw: z.infer<typeof BytefulCountrySchema>,
): Country {
  return {
    id: raw.country_id.toLowerCase(),
    name: raw.country_name,
    nodeCount: raw.country_node_count ?? 0,
  }
}
