import { z } from 'zod'

/** Shared by the list request and the lookup routes, so both accept `GB` as `gb`. */
export const CountryIdSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined
        ? 'is required'
        : 'must be a two-letter country code',
  })
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'must be a two-letter country code')

/** Byteful's numeric ids (`asn_id`, `city_id`). */
export const PositiveIdSchema = z
  .number({ error: 'must be a positive whole number' })
  .int('must be a positive whole number')
  .positive('must be a positive whole number')

/** The body of every lookup route. */
export type LookupResponse<T> = { data: T[] }

/** Byteful search responses: rows in `data`, pagination at the top level. */
export function searchResponseSchema<T extends z.ZodType>(item: T) {
  return z.looseObject({
    data: z.array(item),
    per_page: z.number().int().positive().optional(),
    total_count: z.number().int().nonnegative().optional(),
  })
}

/** Page count from `total_count`; 1 when the response has no usable total. */
export function readTotalPages(
  response: { per_page?: number; total_count?: number },
  perPage: number,
): number {
  const total = response.total_count
  const size = response.per_page ?? perPage

  if (typeof total !== 'number' || size <= 0) return 1

  return Math.max(1, Math.ceil(total / size))
}

/**
 * `residential_availability/search`: one row per group with its live node
 * count. The docs call the array `residential_options`; the API returns
 * `residential_availability`.
 */
export function availabilityResponseSchema<T extends z.ZodType>(row: T) {
  return z.looseObject({
    data: z.looseObject({
      residential_availability: z.array(row),
    }),
  })
}

export const availabilityNodeCount = z.number().int().nonnegative()
