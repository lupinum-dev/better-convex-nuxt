import { fileURLToPath } from 'node:url'

import { convexTestConfig } from '@lupinum/trellis/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    resolve: {
      alias: {
        '@lupinum/trellis/backend': fileURLToPath(
          new URL('../../src/runtime/backend/index.ts', import.meta.url),
        ),
      },
    },
    test: {
      include: ['convex/**/*.test.ts', 'server/**/*.test.ts'],
    },
  }),
)
