import type { ListRequest } from '@/lib/models/residential'

import { generateSessionId } from './sessionId'
import { TARGETING_SEGMENTS } from './targeting'

export const PROXY_HOST = 'residential.byteful.com'
export const PROXY_PORT = 8000

/**
 * The targeting part of the username: `_c_gb_city_london_asn_5089`.
 *
 * Walks `TARGETING_SEGMENTS` in order, so the segment order is data rather
 * than control flow.
 */
export function buildTargetingSuffix(request: ListRequest): string {
  let suffix = ''

  for (const segment of TARGETING_SEGMENTS) {
    const value = request[segment.field]
    if (value === undefined) continue
    suffix += `_${segment.prefix}_${value}`
  }

  return suffix
}

/** `<proxy_user_id><targeting>[_s_<session_id>]` */
export function buildUsername(
  request: ListRequest,
  sessionId?: string,
): string {
  const base = request.proxy_user_id + buildTargetingSuffix(request)
  return sessionId ? `${base}_s_${sessionId}` : base
}

/**
 * `ListRequest -> string[]`. Pure, no I/O.
 *
 * Sticky lists get one unique session ID per line. Rotating lists get the same
 * username `list_count` times, per the spec.
 */
export function buildProxyList(request: ListRequest): string[] {
  const { list_count, list_format, list_session_type, proxy_user_password } =
    request

  const toProxy = (username: string) =>
    `${list_format}://${username}:${proxy_user_password}@${PROXY_HOST}:${PROXY_PORT}`

  if (list_session_type === 'rotating') {
    const username = buildUsername(request)
    return Array.from({ length: list_count }, () => toProxy(username))
  }

  // The Set makes the spec's uniqueness rule structural rather than
  // probabilistic. With 36^16 possible IDs a collision inside a 1000-item list
  // is unreachable in practice; the loop is not there because collisions are
  // expected, it is there so uniqueness is guaranteed by construction.
  const sessionIds = new Set<string>()
  while (sessionIds.size < list_count) {
    sessionIds.add(generateSessionId())
  }

  return Array.from(sessionIds, (sessionId) =>
    toProxy(buildUsername(request, sessionId)),
  )
}
