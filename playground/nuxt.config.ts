import { fileURLToPath } from 'node:url'

const runtimeComposablesEntry = fileURLToPath(
  new URL('../src/runtime/composables/index.ts', import.meta.url),
)
const runtimeServerEntry = fileURLToPath(new URL('../src/runtime/server/index.ts', import.meta.url))

export default defineNuxtConfig({
  modules: ['../src/module'],

  alias: {
    // The playground runs against the local module source, not an installed package.
    // Mirror the published subpath imports so examples stay copy-pastable for consumers.
    'better-convex-nuxt/composables': runtimeComposablesEntry,
    'better-convex-nuxt/server': runtimeServerEntry,
  },

  pages: true,

  devtools: { enabled: true },

  compatibilityDate: '2026-02-26',

  routeRules: {},

  typescript: {
    strict: true,
  },

  convex: {
    permissions: true,
  },
})
