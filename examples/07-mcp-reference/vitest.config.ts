import { defineConfig } from 'vitest/config'

import { convexTestConfig } from '@lupinum/trellis/testing'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['test/**/*.test.ts'],
      name: 'example-mcp-reference',
    },
  }),
)
