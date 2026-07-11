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

  // Keep the playground independent from Nuxt's globally shared default HMR
  // port so it can run alongside other local Nuxt applications and E2E apps.
  vite: {
    server: {
      hmr: { port: 24699 },
    },
  },

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

  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL,
    siteUrl: process.env.NUXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL,
  },
})
