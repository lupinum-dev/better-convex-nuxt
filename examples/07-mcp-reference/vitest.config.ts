import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { convexTestConfig } from '../../src/runtime/testing/index'

export default defineConfig(
  convexTestConfig({
    resolve: {
      alias: {
        '@lupinum/trellis/args': fileURLToPath(
          new URL('../../src/runtime/args/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/auth': fileURLToPath(
          new URL('../../src/runtime/auth/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/backend': fileURLToPath(
          new URL('../../src/runtime/backend/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/mcp': fileURLToPath(
          new URL('../../src/runtime/mcp/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/server': fileURLToPath(
          new URL('../../src/runtime/server/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/testing': fileURLToPath(
          new URL('../../src/runtime/testing/index.ts', import.meta.url),
        ),
        '@lupinum/trellis/workspace': fileURLToPath(
          new URL('../../src/runtime/workspace/index.ts', import.meta.url),
        ),
      },
    },
    test: {
      include: ['test/**/*.test.ts', 'server/api/**/*.test.ts'],
      name: 'example-mcp-reference',
    },
  }),
)
