import 'server-only'

type Entry<T> = { value: T; expiresAt: number }

/**
 * Keys come from user search text, so the map is pruned rather than left to
 * grow with every distinct query an unauthenticated caller can invent.
 */
const MAX_ENTRIES = 500

/**
 * A small in-process TTL cache in front of Byteful.
 *
 * Why not `use cache` / the Next Data Cache? This app runs with
 * `cacheComponents`, where a value crossing the cache boundary is serialised —
 * and so is anything thrown. An `AppError` thrown inside a cached function
 * comes back out as a plain `Error` with a redacted message in production,
 * which collapses `upstream_error`, `lookup_unavailable` and
 * `server_misconfigured` into one `internal_error`. The documented error table
 * is part of the contract, so the cache lives here instead, on our side of the
 * throw.
 *
 * Two properties matter for the shared 20 requests/second budget:
 *
 *   - **only successes are cached**, so a rate-limited lookup is not pinned in
 *     place for the next ten minutes;
 *   - **in-flight requests are shared**, so N users typing the same query
 *     produce one upstream call rather than N.
 *
 * It is per-instance, so a multi-instance deployment caches once per instance.
 * A shared cache (Redis, or Next's Data Cache once it can carry typed
 * failures) is the production answer; this is the right size for one process.
 */
export function cached<A, T>(
  ttlMs: number,
  keyOf: (args: A) => string,
  load: (args: A) => Promise<T>,
): (args: A) => Promise<T> {
  const entries = new Map<string, Entry<T>>()
  const inFlight = new Map<string, Promise<T>>()

  return async (args: A) => {
    const key = keyOf(args)
    const now = Date.now()

    const hit = entries.get(key)
    if (hit && hit.expiresAt > now) return hit.value

    const pending = inFlight.get(key)
    if (pending) return pending

    const request = load(args)
      .then((value) => {
        if (entries.size >= MAX_ENTRIES) prune(entries)
        entries.set(key, { value, expiresAt: Date.now() + ttlMs })
        return value
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, request)
    return request
  }
}

/**
 * Drops expired entries, then the oldest remaining ones if that was not
 * enough. Insertion order is Map iteration order, so "oldest" is free.
 */
function prune<T>(entries: Map<string, Entry<T>>): void {
  const now = Date.now()

  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key)
  }

  for (const key of entries.keys()) {
    if (entries.size < MAX_ENTRIES) break
    entries.delete(key)
  }
}
