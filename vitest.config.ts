import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration
 *
 * Test commands:
 *   pnpm test       - Fast tests only (convex backend)
 *   pnpm test:e2e   - E2E tests (SSR, browser, ~60s)
 *   pnpm test:full  - All tests
 *
 * Run specific project:
 *   pnpm vitest --project=convex
 *   pnpm vitest --project=e2e
 */
export default defineConfig({
  test: {
    // Default timeout for all tests
    testTimeout: 30000,

    // Use projects for different test types
    projects: [
      // Convex Tests: Backend function tests
      // Uses convex-test with edge-runtime
      // Fast (~5s) - run with `pnpm test`
      {
        test: {
          name: 'convex',
          include: ['playground/convex/**/*.test.ts'],
          environment: 'edge-runtime',
          server: { deps: { inline: [/convex/] } },
        },
      },

      // E2E Tests: SSR + Browser behavior tests
      // Uses @nuxt/test-utils for full Nuxt lifecycle
      // Slow (~60s) - run with `pnpm test:e2e`
      {
        test: {
          name: 'e2e',
          include: ['test/**/*.test.ts'],
          testTimeout: 60000,
        },
      },
    ],
  },
})
