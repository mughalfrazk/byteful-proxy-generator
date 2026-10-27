import { z } from 'zod'

import { searchCities } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import { CountryIdSchema, lookupResponse, readParams } from '../shared'

const ParamsSchema = z.object({
  country_id: CountryIdSchema,
})

/**
 * `GET /api/lookup/city?country_id=gb`
 *
 * Returns every city in the country, ordered by node count. `country_id` is
 * required — the unfiltered list spans the world — but there is no `query`
 * parameter: a country's cities are few enough to send whole and filter in the
 * browser, so searching never needs a round trip.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id } = readParams(request, ParamsSchema)

  return lookupResponse(await searchCities({ countryId: country_id }))
})
