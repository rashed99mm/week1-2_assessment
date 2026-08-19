import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // Each file gets its own in-memory MongoDB; running them in one process
    // would have them share a connection and delete each other's data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/setup.ts'],
  },
})
