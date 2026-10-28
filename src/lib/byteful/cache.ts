import 'server-only'

type Entry<T> = { value: T; expiresAt: number }

/** Keys come from query parameters, so the map is bounded. */
const MAX_ENTRIES = 500

/**
 * A small in-process TTL cache in front of Byteful, protecting the account's
 * 20 requests/second budget. Only successes are cached, and concurrent calls
 * for the same key share one upstream request.
 *
 * Not `use cache`: it serialises thrown values, which would turn an `AppError`
 * into a plain `Error` and every failure into `internal_error`.
 *
 * TODO per-instance only. With several instances, a shared cache (Redis)
 * would share both the data and the rate-limit budget.
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

/** Drops expired entries, then the oldest (Map order is insertion order). */
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
