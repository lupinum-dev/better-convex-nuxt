import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['internal/labs/mcp-topology/nitro/**/*.integration.test.ts'],
    testTimeout: 120_000,
  },
})
