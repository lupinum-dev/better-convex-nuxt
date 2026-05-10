import { fileURLToPath } from 'node:url'

import { convexTestConfig } from '@lupinum/trellis/testing'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['test/**/*.test.ts'],
      name: 'example-component-mini-cms',
    },
    resolve: {
      alias: {
        '@lupinum/trellis/backend': fileURLToPath(
          new URL('../../src/runtime/backend/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/functions': fileURLToPath(
          new URL('../../src/runtime/functions/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/trusted-forwarding': fileURLToPath(
          new URL('../../src/runtime/trusted-forwarding/index.ts', import.meta.url),
        ),
      },
    },
  }),
)
