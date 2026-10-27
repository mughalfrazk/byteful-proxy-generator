import 'server-only'

type Entry<T> = { value: T; expiresAt: number }

/**
 * Keys come from user search text, so the map is pruned rather than left to
 * grow with every distinct query an unauthenticated caller can invent.
 */
const MAX_ENTRIES = 500

/**
 * A small in-process TTL cache in front of Byteful, protecting the account's
 * shared 20 requests/second budget.
 *
 * Only successes are cached, so a rate-limited lookup is not pinned in place
 * for the next ten minutes. In-flight requests are shared, so N users typing
 * the same query produce one upstream call rather than N.
 *
 * Not `use cache`: under `cacheComponents` a thrown value crossing the cache
 * boundary is serialised, which turns a typed `AppError` into a plain `Error`
 * and collapses the documented error table into one `internal_error`. The
 * cache therefore lives on our side of the throw.
 *
 * TODO per-instance only. A shared cache (Redis) is the production answer.
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
