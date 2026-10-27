import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Outside a React Server Component graph this package throws on import.
      // The guarantee it provides is a build-time one, so under test it is a
      // no-op and the modules that declare it stay testable.
      'server-only': fileURLToPath(
        new URL('./src/test/server-only-stub.ts', import.meta.url),
      ),
    },
  },
})
