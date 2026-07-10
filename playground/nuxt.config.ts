import { fileURLToPath } from 'node:url'

// The playground consumes the module from source (`../src/module`) and has no
// installed `better-convex-nuxt` in node_modules, so the published
// `better-convex-nuxt/auth-client` subpath — imported by the `convex-auth.ts`
// convention definition — is aliased to the source entry here. A real installed
// consumer resolves it from node_modules via the package `exports` map.
const authClientSource = fileURLToPath(
  new URL('../src/runtime/auth-client/index.ts', import.meta.url),
)

export default defineNuxtConfig({
  modules: ['../src/module'],

  alias: {
    'better-convex-nuxt/auth-client': authClientSource,
  },

  pages: true,

  devtools: { enabled: true },

  compatibilityDate: '2026-02-26',

  routeRules: {},

  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        paths: {
          'better-convex-nuxt/auth-client': [authClientSource],
        },
      },
    },
  },

  convex: {},
})
