import { connection } from 'next/server'

import { searchCountries } from '@/lib/byteful/client'
import { withErrorHandling } from '@/lib/errors'

import { lookupResponse } from '../shared'

/**
 * `GET /api/lookup/country`
 *
 * Every country with at least one node. No parameters: the list is small
 * enough to send whole and filter in the browser.
 */
export const GET = withErrorHandling(async () => {
  // This route reads no request data, so Next would otherwise prerender it at
  // build time — when the API keys are absent and the failure would be baked
  // into the bundle. `connection()` says "wait for a real request". The
  // server-side cache inside `searchCountries` means this costs a render, not
  // an upstream call.
  await connection()

  return lookupResponse(await searchCountries())
})
