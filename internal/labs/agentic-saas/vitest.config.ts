import { defineConfig } from 'vitest/config'

export default defineConfig({
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
    environment: 'node',
    env: {
      CONVEX_SITE_URL: 'http://localhost:3210',
      SITE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRETS: '0:agentic-saas-test-secret-at-least-32-characters',
    },
    include: ['convex/**/*.test.ts'],
  },
})
