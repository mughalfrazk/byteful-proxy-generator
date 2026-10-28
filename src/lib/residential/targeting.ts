/**
 * Username targeting segments, in order. `buildUsername()` walks this table
 * and `ListRequestSchema` reads its `requires` rules.
 *
 * Pure data with no imports, so `lib/models` can depend on it.
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
