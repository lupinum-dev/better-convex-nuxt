import { convexTestConfig } from '@lupinum/trellis/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['convex/**/*.test.ts', 'shared/**/*.test.ts'],
      name: 'example-next-kanban-workspace',
    },
  }),
)
