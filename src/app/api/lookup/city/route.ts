import { z } from 'zod'

import { searchCities } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'
import { CountryIdSchema } from '@/lib/models'

import { lookupResponse, readParams } from '../shared'

const ParamsSchema = z.object({
  country_id: CountryIdSchema,
})

/**
 * `GET /api/lookup/city?country_id=gb`
 *
 * Every city in the country, busiest first. Returns the whole list; the
 * browser searches it.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id } = readParams(request, ParamsSchema)

  return lookupResponse(await searchCities({ countryId: country_id }))
})
