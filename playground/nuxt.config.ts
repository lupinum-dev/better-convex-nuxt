import { fileURLToPath } from 'node:url'

import { convexLocal } from 'convex-vite-plugin'

const runtimeComposablesEntry = fileURLToPath(
  new URL('../src/runtime/composables/index.ts', import.meta.url),
)
const runtimeSchemaEntry = fileURLToPath(new URL('../src/runtime/schema/index.ts', import.meta.url))
const runtimeMcpEntry = fileURLToPath(new URL('../src/runtime/mcp/index.ts', import.meta.url))
const runtimeServerEntry = fileURLToPath(new URL('../src/runtime/server/index.ts', import.meta.url))
const playgroundRoot = fileURLToPath(new URL('./', import.meta.url))
const useLocalConvex = process.env.USE_LOCAL_CONVEX === 'true'
const resetLocalBackend = process.env.RESET_LOCAL_BACKEND === 'true'
const playgroundUrl = process.env.SITE_URL || 'http://localhost:3000'
const localConvexUrl = 'http://127.0.0.1:3210'
const localConvexSiteUrl = 'http://127.0.0.1:3211'
const localPrivateBridgeKey =
  process.env.CONVEX_PRIVATE_BRIDGE_KEY || 'playground-private-bridge-key-not-for-production'

function appendOrigin(origins: string | undefined, origin: string): string {
  const values = new Set(
    (origins ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  values.add(origin)
  return Array.from(values).join(',')
}

export default defineNuxtConfig({
  modules: ['../src/module', '@nuxtjs/mcp-toolkit'],

  mcp: {
    name: 'better-convex-nuxt-playground',
  },

  alias: {
    // The playground runs against the local module source, not an installed package.
    // Mirror the published subpath imports so examples stay copy-pastable for consumers.
    'better-convex-nuxt/composables': runtimeComposablesEntry,
    'better-convex-nuxt/schema': runtimeSchemaEntry,
    'better-convex-nuxt/mcp': runtimeMcpEntry,
    'better-convex-nuxt/server': runtimeServerEntry,
  },

  pages: true,

  nitro: {
    experimental: { asyncContext: true },
  },

  devtools: { enabled: true },

  compatibilityDate: '2026-02-26',

  routeRules: {},

  typescript: {
    strict: true,
  },

  convex: {
    permissions: true,
    url: useLocalConvex
      ? localConvexUrl
      : process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL,
    siteUrl: useLocalConvex
      ? localConvexSiteUrl
      : process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL,
  },

  vite: {
    plugins: [],
  },

  hooks: {
    'vite:extendConfig': (config, { isClient }) => {
      if (!useLocalConvex || !isClient) return
      config.plugins = [
        ...(config.plugins ?? []),
        convexLocal({
          instanceName: 'better-convex-nuxt-playground',
          stateIdSuffix: 'playground-local-v1',
          port: 3210,
          siteProxyPort: 3211,
          projectDir: playgroundRoot,
          convexDir: 'convex',
          reset: resetLocalBackend,
          envVars: {
            SITE_URL: playgroundUrl,
            AUTH_BASE_URL: process.env.AUTH_BASE_URL || playgroundUrl,
            AUTH_TRUSTED_ORIGINS: appendOrigin(process.env.AUTH_TRUSTED_ORIGINS, playgroundUrl),
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET || 'local-dev-better-auth-secret-not-for-production',
            CONVEX_PRIVATE_BRIDGE_KEY: localPrivateBridgeKey,
          },
        }),
      ]
    },
  },
})
