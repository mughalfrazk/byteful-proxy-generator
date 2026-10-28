import { searchCountries } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import { lookupResponse } from '../shared'

/** `GET /api/lookup/country`. Every country with live nodes. */
export const GET = withErrorHandling(async () => {
  return lookupResponse(await searchCountries())
})
