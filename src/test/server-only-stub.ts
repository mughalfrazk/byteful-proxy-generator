/**
 * Stands in for the `server-only` package under Vitest. See the alias in
 * `vitest.config.mts`: the real package exists to fail the *build* when a
 * client module imports server code, which is a guarantee the test runner has
 * no part in.
 */
export {}
