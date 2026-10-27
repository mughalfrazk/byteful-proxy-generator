import { z } from 'zod'

import { searchAsns } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import {
  CountryIdSchema,
  QuerySchema,
  lookupResponse,
  readParams,
} from '../shared'

const ParamsSchema = z.object({
  country_id: CountryIdSchema.optional(),
  query: QuerySchema,
})

/**
 * `GET /api/lookup/asn?country_id=gb&query=virgin`
 *
 * Both parameters are optional. ASN targeting works with or without a country,
 * so the field is usable before a country is picked.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id, query } = readParams(request, ParamsSchema)

  return lookupResponse(await searchAsns({ countryId: country_id, query }))
})
