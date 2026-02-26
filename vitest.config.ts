import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { playwright } from '@vitest/browser-playwright'
import vue from '@vitejs/plugin-vue'
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
 *   pnpm vitest --project=nuxt
 *   pnpm vitest --project=e2e
 */
export default defineConfig({
  test: {
    // Default timeout for all tests
    testTimeout: 10000,

    // Use projects for different test types
    projects: [
      // Unit Tests: Pure utility function tests
      // Fast (<1s) - run with `pnpm vitest --project=unit`
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },

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

      // Nuxt Runtime Tests: composables/components needing nuxtApp context
      // Fast-medium (~seconds) - run with `pnpm vitest --project=nuxt`
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
            },
          },
        },
      }),

      // Browser Component Tests: native browser rendering for Vue components
      {
        plugins: [vue()],
        resolve: {
          alias: {
            '#imports': fileURLToPath(new URL('./test/browser/shims/imports.ts', import.meta.url)),
          },
        },
        test: {
          name: 'browser',
          include: ['test/browser/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },

      // E2E Tests: SSR + Browser behavior tests
      // Uses @nuxt/test-utils for full Nuxt lifecycle
      // Manual/local only, serial to avoid port collisions
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e.test.ts'],
          testTimeout: 60000,
          fileParallelism: false,
        },
      },
    ],
  },
})
