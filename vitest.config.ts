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
 *   pnpm vitest --project=server
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
            '@lupinum/trellis/auth': fileURLToPath(
              new URL('./src/runtime/auth/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/backend': fileURLToPath(
              new URL('./src/runtime/backend/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/workspace': fileURLToPath(
              new URL('./src/runtime/workspace/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/args': fileURLToPath(
              new URL('./src/runtime/args/index.ts', import.meta.url),
            ),
            '@lupinum/trellis-bridge/component': fileURLToPath(
              new URL('./packages/trellis-bridge/src/component.ts', import.meta.url),
            ),
            '@lupinum/trellis-bridge/manifest': fileURLToPath(
              new URL('./packages/trellis-bridge/src/manifest.ts', import.meta.url),
            ),
            '@lupinum/trellis-bridge': fileURLToPath(
              new URL('./packages/trellis-bridge/src/index.ts', import.meta.url),
            ),
            'convex-helpers/server/customFunctions': fileURLToPath(
              new URL('./tests/support/convex-custom-functions-mock.ts', import.meta.url),
            ),
            'convex-helpers/server/customFunctions.js': fileURLToPath(
              new URL('./tests/support/convex-custom-functions-mock.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          testTimeout: 15000,
          server: { deps: { inline: [/convex-helpers/] } },
        },
      },

      // Convex Tests: Backend function tests
      // Uses convex-test with edge-runtime
      // Fast (~5s) - run with `pnpm test`
      {
        resolve: {
          alias: {
            '@lupinum/trellis/composables': fileURLToPath(
              new URL('./src/runtime/composables/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/auth': fileURLToPath(
              new URL('./src/runtime/auth/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/workspace': fileURLToPath(
              new URL('./src/runtime/workspace/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/mcp': fileURLToPath(
              new URL('./src/runtime/mcp/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/args': fileURLToPath(
              new URL('./src/runtime/args/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/server': fileURLToPath(
              new URL('./src/runtime/server/index.ts', import.meta.url),
            ),
            '@lupinum/trellis/testing': fileURLToPath(
              new URL('./src/runtime/testing/index.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'convex',
          include: ['apps/harness/convex/**/*.test.ts'],
          environment: 'edge-runtime',
          testTimeout: 15000,
          server: { deps: { inline: [/convex/] } },
        },
      },

      // Nuxt Runtime Tests: composables/components needing nuxtApp context
      // Fast-medium (~seconds) - run with `pnpm vitest --project=nuxt`
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          testTimeout: 15000,
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
            },
          },
        },
      }),

      // Server Auth Tests: server-side auth helpers and cache behavior
      // Fast (<1s) - run with `pnpm vitest --project=server`
      {
        test: {
          name: 'server',
          include: ['tests/server/**/*.test.ts'],
          environment: 'node',
          testTimeout: 15000,
        },
      },

      // Browser Component Tests: native browser rendering for Vue components
      {
        plugins: [vue()],
        resolve: {
          alias: {
            '#imports': fileURLToPath(
              new URL('./tests/support/browser/imports.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.browser.test.ts'],
          testTimeout: 15000,
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
          include: ['tests/e2e/**/*.e2e.test.ts'],
          testTimeout: 60000,
          fileParallelism: false,
        },
      },
    ],
  },
})
