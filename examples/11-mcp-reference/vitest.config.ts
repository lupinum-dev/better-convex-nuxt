import { defineConfig } from 'vitest/config'

import { convexTestConfig } from '../../dist/runtime/testing/index.js'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['test/**/*.test.ts'],
      name: 'example-mcp-reference',
    },
  }),
)
