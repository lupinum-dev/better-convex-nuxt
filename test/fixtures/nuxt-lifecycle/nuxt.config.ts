import { fileURLToPath } from 'node:url'

const lifecycleMock = fileURLToPath(
  new URL('../browser-runtime/mock-convex-browser.ts', import.meta.url),
)

export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    auth: false,
    defaults: { server: false, subscribe: true, waitTimeoutMs: 1_000 },
    url: 'https://nuxt-lifecycle.invalid',
  },
  devtools: { enabled: false },
  vite: {
    resolve: {
      alias: {
        'convex/browser': lifecycleMock,
      },
    },
  },
})
