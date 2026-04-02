import { convexTestConfig } from '@lupinum/trellis/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['convex/**/*.test.ts'],
      name: 'example-public-todo',
    },
  }),
)
