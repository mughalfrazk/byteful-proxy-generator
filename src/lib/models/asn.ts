import { z } from 'zod'

import { searchResponseSchema } from './common'

/** The upstream shape of `GET /1.0/public/user/asn/search`. */
export const BytefulAsnSchema = z.looseObject({
  asn_id: z.number().int().positive(),
  asn_name: z.string(),
  asn_node_count: z.number().int().nonnegative().nullish(),
  country_id: z.string().nullish(),
})

export const BytefulAsnSearchSchema = searchResponseSchema(BytefulAsnSchema)

export type Asn = {
  id: number
  name: string
  nodeCount: number
}

export function narrowAsn(raw: z.infer<typeof BytefulAsnSchema>): Asn {
  return {
    id: raw.asn_id,
    name: raw.asn_name,
    nodeCount: raw.asn_node_count ?? 0,
  }
}
