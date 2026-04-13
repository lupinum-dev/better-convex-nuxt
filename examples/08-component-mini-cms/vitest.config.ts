import { convexTestConfig } from '@lupinum/trellis/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['test/**/*.test.ts'],
      name: 'example-component-mini-cms',
    },
  }),
)
