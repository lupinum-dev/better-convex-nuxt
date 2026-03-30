import { defineConfig } from 'vitest/config'

import { convexTestConfig } from 'better-convex-nuxt/testing'

export default defineConfig(convexTestConfig({
  test: {
    include: ['convex/**/*.test.ts'],
  },
}))
