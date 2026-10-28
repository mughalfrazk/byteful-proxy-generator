import { z } from 'zod'

import { searchAsns } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'
import { CountryIdSchema, PositiveIdSchema } from '@/lib/models'

import { lookupResponse, readParams } from '../shared'

const ParamsSchema = z
  .object({
    country_id: CountryIdSchema.optional(),
    // A query string is text, so the id is converted before it is checked;
    // `abc` becomes NaN, which the id schema rejects.
    city_id: z.preprocess(Number, PositiveIdSchema).optional(),
  })
  // Mirrors the list endpoint: a city only means something inside a country.
  .refine((params) => params.city_id === undefined || params.country_id, {
    path: ['city_id'],
    message: 'requires country_id',
  })

/**
 * `GET /api/lookup/asn?country_id=gb&city_id=380781`
 *
 * Both optional: worldwide, a country, or a city in it. Returns the whole
 * list; the browser searches it.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const { country_id, city_id } = readParams(request, ParamsSchema)

  return lookupResponse(
    await searchAsns({ countryId: country_id, cityId: city_id }),
  )
})
