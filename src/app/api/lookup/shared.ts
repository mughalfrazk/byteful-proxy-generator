import { z } from 'zod'

import { invalidParameter } from '@/lib/errors'
import type { LookupResponse } from '@/lib/models'

/** Browser-facing cache window for lookup responses. */
export const LOOKUP_CACHE_CONTROL = 'public, max-age=300'

/**
 * Reads only the schema's keys from the URL, so other parameters are never
 * forwarded to Byteful.
 */
export function readParams<T extends z.ZodObject>(
  request: Request,
  schema: T,
): z.infer<T> {
  const url = new URL(request.url)
  const raw: Record<string, string> = {}

  for (const key of Object.keys(schema.shape)) {
    const value = url.searchParams.get(key)
    if (value !== null && value !== '') raw[key] = value
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw invalidParameter(parsed.error)

  return parsed.data
}

export function lookupResponse<T>(data: T[]): Response {
  const body: LookupResponse<T> = { data }
  return Response.json(
    body,
    { status: 200, headers: { 'Cache-Control': LOOKUP_CACHE_CONTROL } },
  )
}
