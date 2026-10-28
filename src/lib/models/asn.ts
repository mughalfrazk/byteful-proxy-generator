import { z } from 'zod'

import { availabilityNodeCount, availabilityResponseSchema } from './common'

/**
 * A `residential_availability/search?group_by=asn` row. Not `asn/search`,
 * which files an ASN under its country of registration, not where its nodes are.
 */
export const BytefulAsnAvailabilitySchema = z.looseObject({
  asn_id: z.number().int().positive(),
  asn_name: z.string(),
  residential_availability_node_count: availabilityNodeCount,
})

export const BytefulAsnAvailabilityResponseSchema = availabilityResponseSchema(
  BytefulAsnAvailabilitySchema,
)

export type Asn = {
  id: number
  name: string
  nodeCount: number
}

export function narrowAsn(raw: z.infer<typeof BytefulAsnAvailabilitySchema>): Asn {
  return {
    id: raw.asn_id,
    name: raw.asn_name,
    nodeCount: raw.residential_availability_node_count,
  }
}
