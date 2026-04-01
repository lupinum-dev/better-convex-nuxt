import { convexTestConfig } from 'better-convex-nuxt/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['convex/**/*.test.ts'],
      name: 'example-team-todo',
    },
  }),
)
