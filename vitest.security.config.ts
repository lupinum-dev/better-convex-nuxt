import { defineConfig } from 'vitest/config'

/**
 * Isolated characterization experiments for the Better Auth security audit.
 *
 * These tests intentionally record current behavior, including behavior that the
 * audit may classify as unsafe. Run them explicitly; they are not a normal CI
 * approval gate and must be replaced with fail-closed regression tests as fixes
 * land.
 */
export default defineConfig({
  test: {
    include: ['test/security/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
