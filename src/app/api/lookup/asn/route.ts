import { z } from 'zod'

import { searchAsns } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import { CountryIdSchema, lookupResponse, readParams } from '../shared'

const ParamsSchema = z.object({
  country_id: CountryIdSchema.optional(),
})

/**
 * `GET /api/lookup/asn?country_id=gb`
 *
 * `country_id` is optional: ASN targeting works with or without a country, so
 * the field is usable before one is picked. Like cities, the full list comes
 * back and the browser searches it, so there is no `query` parameter.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id } = readParams(request, ParamsSchema)

  return lookupResponse(await searchAsns({ countryId: country_id }))
})
