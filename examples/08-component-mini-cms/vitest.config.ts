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
        '@lupinum/trellis-bridge/component': fileURLToPath(
          new URL('../../packages/trellis-bridge/src/component.ts', import.meta.url),
        ),
        '@lupinum/trellis/backend': fileURLToPath(
          new URL('../../src/runtime/backend/index.ts', import.meta.url),
        ),
        '@lupinum/trellis-bridge': fileURLToPath(
          new URL('../../packages/trellis-bridge/src/index.ts', import.meta.url),
        ),
      },
    },
  }),
)
