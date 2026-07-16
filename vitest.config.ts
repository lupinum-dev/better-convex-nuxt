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
 *   pnpm test:e2e   - Full-stack tests used locally and by release:verify
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

      // Security regression tests are a mandatory release gate.
      {
        resolve: {
          alias: {
            '#app': fileURLToPath(new URL('./test/unit/shims/app.ts', import.meta.url)),
          },
        },
        test: {
          name: 'security',
          include: ['test/security/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },

      // Convex Tests: Backend function tests
      // Uses convex-test with edge-runtime
      // Fast (~5s) - run with `pnpm test`
      {
        resolve: {
          alias: {
            'better-convex-nuxt/server/createUserSyncTriggers': fileURLToPath(
              new URL('./src/runtime/server/createUserSyncTriggers.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'convex',
          include: ['playground/convex/**/*.test.ts', 'demo/convex/**/*.test.ts'],
          environment: 'edge-runtime',
          server: { deps: { inline: [/convex/] } },
          // Convex component registration is CPU-heavy and parallel files contend
          // for the same worker resources. Run this backend corpus serially and
          // retain a finite bound that also works on a busy contributor machine.
          fileParallelism: false,
          testTimeout: 60_000,
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
      // Serial to avoid port collisions
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
