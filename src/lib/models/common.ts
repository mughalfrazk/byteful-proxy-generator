import { z } from 'zod'

/**
 * Byteful's search endpoints carry their pagination at the top level of the
 * response, alongside `data`:
 *
 * ```json
 * { "data": [...], "item_count": 2, "page": 1, "per_page": 2, "total_count": 250 }
 * ```
 *
 * `item_count` is how many rows came back; `total_count` is how many match the
 * filter in total, which is what the page count is derived from.
 */
export function searchResponseSchema<T extends z.ZodType>(item: T) {
  return z.looseObject({
    data: z.array(item),
    page: z.number().int().positive().optional(),
    per_page: z.number().int().positive().optional(),
    item_count: z.number().int().nonnegative().optional(),
    total_count: z.number().int().nonnegative().optional(),
  })
}

export type SearchResponse<T> = {
  data: T[]
  page?: number
  per_page?: number
  item_count?: number
  total_count?: number
}

/**
 * How many pages exist in total.
 *
 * Deriving this from `total_count` beats hardcoding a page count: a fixed
 * number silently truncates the list the day Byteful returns one more page
 * than we guessed. A response without a usable total degrades to "what we
 * already fetched" rather than to an error.
 */
export function readTotalPages(
  response: SearchResponse<unknown>,
  perPage: number,
): number {
  const total = response.total_count
  const size = response.per_page ?? perPage

  if (typeof total !== 'number' || size <= 0) return 1

  return Math.max(1, Math.ceil(total / size))
}
