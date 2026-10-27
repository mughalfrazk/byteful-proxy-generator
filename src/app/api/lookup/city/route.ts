import { z } from 'zod'

import { searchCities } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import {
  CountryIdSchema,
  QuerySchema,
  lookupResponse,
  readParams,
} from '../shared'

const ParamsSchema = z.object({
  country_id: CountryIdSchema,
  query: QuerySchema,
})

/**
 * `GET /api/lookup/city?country_id=gb&query=nor`
 *
 * `country_id` is required: the city list is far too large to return
 * unfiltered. An empty `query` returns the top cities by node count rather
 * than an empty box.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id, query } = readParams(request, ParamsSchema)

  return lookupResponse(await searchCities({ countryId: country_id, query }))
})
