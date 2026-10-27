import { z } from 'zod'

import { TARGETING_REQUIREMENTS } from '@/lib/residential/targeting'

export const LIST_FORMATS = ['http', 'https', 'socks5', 'socks5h'] as const
export const LIST_SESSION_TYPES = ['sticky', 'rotating'] as const

export const DEFAULT_LIST_COUNT = 100
export const MIN_LIST_COUNT = 1
export const MAX_LIST_COUNT = 1000

export type ListFormat = (typeof LIST_FORMATS)[number]
export type ListSessionType = (typeof LIST_SESSION_TYPES)[number]

/**
 * The one request contract. It validates the form (through the react-hook-form
 * resolver) and the `POST /api/residential/list` body, so the client and the
 * server rules cannot drift.
 *
 * `strictObject` matters: a typo such as `country` instead of `country_id`
 * returns an error rather than silently producing an untargeted list.
 */
export const ListRequestSchema = z
  .strictObject({
    proxy_user_id: z
      .string({ error: 'proxy_user_id is required' })
      .trim()
      .min(1, 'proxy_user_id is required'),

    proxy_user_password: z
      .string({ error: 'proxy_user_password is required' })
      .min(1, 'proxy_user_password is required'),

    list_count: z
      .number({
        error: `list_count must be a whole number from ${MIN_LIST_COUNT} to ${MAX_LIST_COUNT}`,
      })
      .int(`list_count must be a whole number, not a decimal`)
      .min(MIN_LIST_COUNT, `list_count must be at least ${MIN_LIST_COUNT}`)
      .max(MAX_LIST_COUNT, `list_count must be at most ${MAX_LIST_COUNT}`)
      .default(DEFAULT_LIST_COUNT),

    list_format: z
      .enum(LIST_FORMATS, {
        error: `list_format must be one of ${LIST_FORMATS.join(', ')}`,
      })
      .default('http'),

    list_session_type: z
      .enum(LIST_SESSION_TYPES, {
        error: `list_session_type must be one of ${LIST_SESSION_TYPES.join(', ')}`,
      })
      .default('sticky'),

    // Shape only. Whether the value exists in Byteful's data is not checked
    // here; that would need a lookup call on every generate. See the README.
    country_id: z
      .string({ error: 'country_id must be a two-letter country code' })
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2}$/, 'country_id must be a two-letter country code')
      .optional(),

    city_alias: z
      .string({ error: 'city_alias must be a non-empty string' })
      .trim()
      .min(1, 'city_alias must be a non-empty string')
      .optional(),

    asn_id: z
      .number({ error: 'asn_id must be a positive whole number' })
      .int('asn_id must be a positive whole number')
      .positive('asn_id must be a positive whole number')
      .optional(),
  })
  // Cross-field rules are read from the targeting table, so they cannot drift
  // from the username format the builder produces.
  .superRefine((value, ctx) => {
    for (const [dependent, prerequisite] of TARGETING_REQUIREMENTS) {
      if (value[dependent] !== undefined && value[prerequisite] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [dependent],
          message: `${dependent} requires ${prerequisite}`,
        })
      }
    }
  })

/** What the form holds and what a client sends: defaults are still optional. */
export type ListRequestInput = z.input<typeof ListRequestSchema>

/** What the business logic receives: defaults applied, values normalised. */
export type ListRequest = z.output<typeof ListRequestSchema>

/**
 * The success message the spec prescribes for the list endpoint. Byteful's own
 * API carries a `message` on every response (`"ASN search successful."`), so
 * this matches both the spec and the house convention.
 */
export const LIST_SUCCESS_MESSAGE = 'Residential list successfully generated.'

/**
 * The list route's success body. A type rather than a schema — nothing
 * re-parses our own output.
 *
 * `data` and `message` are the spec's contract. `count` is an addition kept for
 * API consumers: it makes a truncated or empty response obvious without
 * counting lines, which matters for a body that can carry 1000 of them.
 */
export type ListResponse = {
  data: string[]
  message: string
  count: number
}
