import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '#convex/api': fileURLToPath(new URL('./test/mocks/convexApi.ts', import.meta.url)),
      '#convex/server': fileURLToPath(new URL('./test/mocks/convexServer.ts', import.meta.url)),
      '#imports': fileURLToPath(new URL('./test/mocks/imports.ts', import.meta.url)),
      '~~': rootDir,
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        types: ['vite/client'],
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'convex',
          environment: 'edge-runtime',
          include: ['convex/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
})
