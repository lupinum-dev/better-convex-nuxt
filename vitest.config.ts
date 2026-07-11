import { fileURLToPath } from 'node:url'

import { defineVitestProject } from '@nuxt/test-utils/config'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration
 *
 * Test commands:
 *   pnpm test       - CI/local gate (unit + convex + nuxt + browser)
 *   pnpm test:e2e   - Manual E2E tests (SSR + full stack)
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
        resolve: {
          alias: {
            '#app': fileURLToPath(new URL('./test/unit/shims/app.ts', import.meta.url)),
          },
        },
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
          include: ['test/nuxt/**/*.test.ts', 'test/proofs/harnesses/**/*.nuxt.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
            },
          },
        },
      }),

      // Phase 0 lifecycle/two-app/HMR harnesses (internal §17.3, §20): plain
      // Node environment, no Nuxt/Vue context needed. Serial because the HMR
      // harness boots a real Vite dev server + headless browser on a fixed
      // port range (4640-4649, see proofs-harness.md).
      {
        test: {
          name: 'proofs-harnesses',
          include: ['test/proofs/harnesses/**/*.harness.test.ts'],
          environment: 'node',
          testTimeout: 60000,
          fileParallelism: false,
        },
      },

      // Browser Component Tests: native browser rendering for Vue components
      {
        plugins: [vue()],
        optimizeDeps: {
          include: ['convex/values', 'vue'],
        },
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
