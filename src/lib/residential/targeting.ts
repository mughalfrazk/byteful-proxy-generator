/**
 * The single place to extend targeting.
 *
 * Adding a zip code (`zip_code_id`) or a US state (`subdivision_id`) — both of
 * which Byteful's real endpoint supports — means one entry here, one schema
 * field and one form field. Nothing else needs to change:
 *
 *   - `buildUsername()` walks this table in order to assemble the username;
 *   - `ListRequestSchema` reads the `requires` rules from it, so the
 *     cross-field validation can never drift from the username format.
 *
 * This file is pure data with no imports, which is why `lib/models` is allowed
 * to read it without inverting the layering: there is one table, and both the
 * schema and the builder read it rather than restating it.
 */
export const TARGETING_SEGMENTS = [
  { field: 'country_id', prefix: 'c' },
  { field: 'city_alias', prefix: 'city', requires: 'country_id' },
  { field: 'asn_id', prefix: 'asn' },
] as const

export type TargetingSegment = (typeof TARGETING_SEGMENTS)[number]
export type TargetingField = TargetingSegment['field']

/** The `requires` rules as `[dependent, prerequisite]` pairs. */
export const TARGETING_REQUIREMENTS: ReadonlyArray<
  readonly [TargetingField, TargetingField]
> = TARGETING_SEGMENTS.flatMap((segment) =>
  'requires' in segment
    ? [[segment.field, segment.requires] as const]
    : [],
)
