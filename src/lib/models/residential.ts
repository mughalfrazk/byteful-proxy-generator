import { z } from 'zod'

import { TARGETING_REQUIREMENTS } from '@/lib/residential/targeting'

import { CountryIdSchema, PositiveIdSchema } from './common'

export const LIST_FORMATS = ['http', 'https', 'socks5', 'socks5h'] as const
export const LIST_SESSION_TYPES = ['sticky', 'rotating'] as const

export const DEFAULT_LIST_COUNT = 100
export const MIN_LIST_COUNT = 1
export const MAX_LIST_COUNT = 1000

export type ListFormat = (typeof LIST_FORMATS)[number]
export type ListSessionType = (typeof LIST_SESSION_TYPES)[number]

// Both credentials go into the proxy URL unescaped, so `@`, `:` or `/` would
// break it.
const ALPHANUMERIC = /^[A-Za-z0-9]+$/
const ALPHANUMERIC_MESSAGE = 'must contain only letters and numbers'

/**
 * The one request contract, used by both the form resolver and the API route.
 *
 * Strict, so a typo such as `country` instead of `country_id` is an error
 * rather than an untargeted list. Messages omit the field name: the API
 * prefixes it, and the form shows it as the label.
 */
export const ListRequestSchema = z
  .strictObject({
    proxy_user_id: z
      .string({ error: 'is required' })
      .min(1, { error: 'is required', abort: true })
      .regex(ALPHANUMERIC, ALPHANUMERIC_MESSAGE),

    proxy_user_password: z
      .string({ error: 'is required' })
      .min(1, { error: 'is required', abort: true })
      .regex(ALPHANUMERIC, ALPHANUMERIC_MESSAGE),

    list_count: z
      .number({
        error: `must be a whole number from ${MIN_LIST_COUNT} to ${MAX_LIST_COUNT}`,
      })
      .int('must be a whole number, not a decimal')
      .min(MIN_LIST_COUNT, `must be at least ${MIN_LIST_COUNT}`)
      .max(MAX_LIST_COUNT, `must be at most ${MAX_LIST_COUNT}`)
      .default(DEFAULT_LIST_COUNT),

    list_format: z
      .enum(LIST_FORMATS, {
        error: `must be one of ${LIST_FORMATS.join(', ')}`,
      })
      .default('http'),

    list_session_type: z
      .enum(LIST_SESSION_TYPES, {
        error: `must be one of ${LIST_SESSION_TYPES.join(', ')}`,
      })
      .default('sticky'),

    // Shape only; existence in Byteful's data is not checked. See the README.
    country_id: CountryIdSchema.optional(),

    // Real aliases are lowercase letters, digits and underscores
    // (`ca_on_london`), which also keeps URL syntax out of the username.
    city_alias: z
      .string({ error: 'must be a city alias from the city search' })
      .trim()
      .regex(
        /^[a-z0-9_]+$/,
        'must be a city alias from the city search (lowercase letters, digits and underscores)',
      )
      .optional(),

    asn_id: PositiveIdSchema.optional(),
  })
  // Cross-field rules come from the targeting table, so they match the
  // username format the builder produces.
  .superRefine((value, ctx) => {
    for (const [dependent, prerequisite] of TARGETING_REQUIREMENTS) {
      if (value[dependent] !== undefined && value[prerequisite] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [dependent],
          message: `requires ${prerequisite}`,
        })
      }
    }
  })

/** What the form holds and a client sends: defaulted fields are optional. */
export type ListRequestInput = z.input<typeof ListRequestSchema>

/** What the business logic receives: defaults applied, values normalised. */
export type ListRequest = z.output<typeof ListRequestSchema>

export const LIST_SUCCESS_MESSAGE = 'Residential list successfully generated.'

/** `data` and `message` are the spec's; `count` is an addition for API readers. */
export type ListResponse = {
  data: string[]
  message: string
  count: number
}
