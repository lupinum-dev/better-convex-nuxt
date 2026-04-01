import { fileURLToPath } from 'node:url'

import { convexLocal } from 'convex-vite-plugin'

const runtimeComposablesEntry = fileURLToPath(
  new URL('../../src/runtime/composables/index.ts', import.meta.url),
)
const runtimeAuthEntry = fileURLToPath(new URL('../../src/runtime/auth/index.ts', import.meta.url))
const runtimeArgsEntry = fileURLToPath(new URL('../../src/runtime/args/index.ts', import.meta.url))
const runtimeTrustedCallerEntry = fileURLToPath(
  new URL('../../src/runtime/trusted-caller/index.ts', import.meta.url),
)
const runtimeVisibilityEntry = fileURLToPath(
  new URL('../../src/runtime/visibility/index.ts', import.meta.url),
)
const runtimeMcpEntry = fileURLToPath(new URL('../../src/runtime/mcp/index.ts', import.meta.url))
const runtimeServerEntry = fileURLToPath(new URL('../../src/runtime/server/index.ts', import.meta.url))
const harnessRoot = fileURLToPath(new URL('./', import.meta.url))
const useLocalConvex = process.env.USE_LOCAL_CONVEX === 'true'
const resetLocalBackend = process.env.RESET_LOCAL_BACKEND === 'true'
const harnessUrl = process.env.SITE_URL || 'http://localhost:3000'
const localConvexUrl = 'http://127.0.0.1:3210'
const localConvexSiteUrl = 'http://127.0.0.1:3211'
const localPrivateBridgeKey =
  process.env.CONVEX_PRIVATE_BRIDGE_KEY || 'internal-harness-private-bridge-key-not-for-production'

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
  modules: ['../../src/module', '@nuxtjs/mcp-toolkit'],

  mcp: {
    name: 'better-convex-nuxt-internal-harness',
    sessions: true,
  },

  alias: {
    // The internal harness runs against the local module source, not an installed package.
    // Mirror the published subpath imports so examples stay copy-pastable for consumers.
    'better-convex-nuxt/composables': runtimeComposablesEntry,
    'better-convex-nuxt/auth': runtimeAuthEntry,
    'better-convex-nuxt/args': runtimeArgsEntry,
    'better-convex-nuxt/mcp': runtimeMcpEntry,
    'better-convex-nuxt/server': runtimeServerEntry,
    'better-convex-nuxt/trusted-caller': runtimeTrustedCallerEntry,
    'better-convex-nuxt/visibility': runtimeVisibilityEntry,
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
    url: useLocalConvex
      ? localConvexUrl
      : process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL,
    siteUrl: useLocalConvex
      ? localConvexSiteUrl
      : process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL,
    auth: {
      enabled: true,
      ensureUserMutation: 'auth.createUserIfNeeded',
    },
    permissions: {
      query: 'auth.getPermissionContext',
    },
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
          instanceName: 'better-convex-nuxt-internal-harness',
          stateIdSuffix: 'internal-harness-local-v1',
          port: 3210,
          siteProxyPort: 3211,
          projectDir: harnessRoot,
          convexDir: 'convex',
          reset: resetLocalBackend,
          envVars: {
            SITE_URL: harnessUrl,
            AUTH_BASE_URL: process.env.AUTH_BASE_URL || harnessUrl,
            AUTH_TRUSTED_ORIGINS: appendOrigin(process.env.AUTH_TRUSTED_ORIGINS, harnessUrl),
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET || 'local-dev-better-auth-secret-not-for-production',
            CONVEX_PRIVATE_BRIDGE_KEY: localPrivateBridgeKey,
          },
        }),
      ]
    },
  },
})
