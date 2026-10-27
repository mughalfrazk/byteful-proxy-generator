import { z } from 'zod'

import { searchResponseSchema } from './common'

/**
 * The upstream shape of `GET /1.0/public/user/city/search`.
 *
 * `city_alias` is the value the proxy username needs. Aliases are lowercase
 * and underscore-separated (`london`, `east_london`, `ca_on_london`), so they
 * are already safe to drop into a username unescaped.
 *
 * `subdivision_id` is an ISO 3166-2 code such as `gb-lnd` or `de-nw`; its
 * country prefix is what the country filter matches on.
 */
export const BytefulCitySchema = z.looseObject({
  city_alias: z.string(),
  city_name: z.string(),
  city_node_count: z.number().int().nonnegative().nullish(),
  subdivision_id: z.string().nullish(),
})

export const BytefulCitySearchSchema = searchResponseSchema(BytefulCitySchema)

export type City = {
  alias: string
  name: string
  nodeCount: number
  /**
   * The subdivision code without its country prefix, upper-cased: `NY` from
   * `us-ny`. City names repeat within a country — the US has three Albanys —
   * so this is what tells them apart in the picker. Empty when Byteful omits
   * the field, which no observed row does.
   */
  subdivision: string
}

export function narrowCity(raw: z.infer<typeof BytefulCitySchema>): City {
  return {
    alias: raw.city_alias,
    name: raw.city_name,
    nodeCount: raw.city_node_count ?? 0,
    subdivision: (raw.subdivision_id?.split('-')[1] ?? '').toUpperCase(),
  }
}
