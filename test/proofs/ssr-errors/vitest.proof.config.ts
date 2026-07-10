import { defineConfig } from 'vitest/config'

// Standalone config so this proof does not touch the shared vitest.config.ts.
// Node environment; @nuxt/test-utils/e2e drives a real prod build + node server
// and createPage() drives a real Playwright/chromium browser for hydration.
export default defineConfig({
  test: {
    name: 'ssr-errors-proof',
    root: new URL('../../../', import.meta.url).pathname,
    include: ['test/proofs/ssr-errors/**/*.proof.test.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
})
