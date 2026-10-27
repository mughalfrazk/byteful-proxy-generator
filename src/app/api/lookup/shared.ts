import { z } from 'zod'

import { invalidParameter } from '@/lib/errors'

/** Browser-facing cache window for lookup responses. */
export const LOOKUP_CACHE_CONTROL = 'public, max-age=300'

export const MAX_QUERY_LENGTH = 100

export const CountryIdSchema = z
  .string({ error: 'country_id is required and must be a two-letter code' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'country_id must be a two-letter country code')

export const QuerySchema = z
  .string()
  .trim()
  .max(MAX_QUERY_LENGTH, `query must be at most ${MAX_QUERY_LENGTH} characters`)
  .optional()

/**
 * Reads an allowlist of parameters from the URL. Anything else in the query
 * string is ignored rather than forwarded, so these routes cannot be used as
 * an open proxy onto Byteful's parameter surface.
 */
export function readParams<T extends z.ZodType>(
  request: Request,
  schema: T,
): z.infer<T> {
  const url = new URL(request.url)
  const raw: Record<string, string> = {}

  for (const key of Object.keys((schema as unknown as { shape: object }).shape)) {
    const value = url.searchParams.get(key)
    if (value !== null && value !== '') raw[key] = value
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw invalidParameter(parsed.error)

  return parsed.data as z.infer<T>
}

export function lookupResponse<T>(data: T[]): Response {
  return Response.json(
    { data },
    { status: 200, headers: { 'Cache-Control': LOOKUP_CACHE_CONTROL } },
  )
}
